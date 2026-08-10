import { createHmac, timingSafeEqual } from "node:crypto";
import type { Config } from "./config.js";
import type { Plan, ProviderSubscriptionSnapshot, SubscriptionState } from "./domain.js";
import type { CheckoutInput, CheckoutResult, PaymentProvider, WebhookRequest } from "./payment-provider.js";

type JsonRecord = Record<string, unknown>;

const API = "https://api.mercadopago.com";

function object(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Resposta inválida do provedor de pagamento.");
  return value as JsonRecord;
}

function string(value: unknown): string | null { return typeof value === "string" && value.length ? value : null; }
function date(value: unknown): Date | null { const parsed = string(value); return parsed && !Number.isNaN(Date.parse(parsed)) ? new Date(parsed) : null; }
function cents(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : 0; }

function mapStatus(value: unknown): SubscriptionState {
  switch (value) {
    case "authorized": case "approved": return "ACTIVE";
    case "paused": case "pending": case "in_process": return "PAYMENT_PENDING";
    case "past_due": case "rejected": return "PAYMENT_FAILED";
    case "cancelled": case "cancelled_by_user": return "CANCELED";
    case "refunded": case "charged_back": return "REFUNDED";
    case "expired": return "EXPIRED";
    default: return "PAYMENT_PENDING";
  }
}

export class MercadoPagoProvider implements PaymentProvider {
  constructor(private readonly config: Config, private readonly now: () => Date = () => new Date()) {}

  private async request(path: string, init: RequestInit = {}): Promise<JsonRecord> {
    if (!path.startsWith("/")) throw new Error("Caminho inválido para o provedor.");
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.config.MERCADO_PAGO_ACCESS_TOKEN}`, "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(15_000),
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Mercado Pago indisponível (${response.status}).`);
    return object(body);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> { return this.createSubscription(input); }
  async createSubscription(input: CheckoutInput): Promise<CheckoutResult> {
    const response = await this.request("/preapproval", { method: "POST", body: JSON.stringify({
      payer_email: input.customerEmail,
      external_reference: input.subscriptionId,
      back_url: `${this.config.COMMERCIAL_PUBLIC_URL}/checkout/return`,
      status: "pending",
      reason: `${input.plan.name} - ${input.plan.billingCycle === "MONTHLY" ? "mensal" : "anual"}`,
      auto_recurring: {
        frequency: input.plan.billingCycle === "MONTHLY" ? 1 : 12,
        frequency_type: "months",
        transaction_amount: input.plan.amountCents / 100,
        currency_id: "BRL",
      },
    }) });
    const providerSubscriptionId = string(response.id);
    const checkoutUrl = string(response.init_point);
    if (!providerSubscriptionId || !checkoutUrl || !checkoutUrl.startsWith("https://")) throw new Error("Checkout incompleto retornado pelo provedor.");
    return { providerSubscriptionId, checkoutUrl };
  }

  private subscriptionSnapshot(resource: JsonRecord, eventId: string, eventType: string): ProviderSubscriptionSnapshot {
    const recurring = resource.auto_recurring && typeof resource.auto_recurring === "object" ? object(resource.auto_recurring) : {};
    const id = string(resource.id);
    const externalReference = string(resource.external_reference);
    if (!id || !externalReference) throw new Error("Assinatura do provedor sem vínculo interno.");
    return { providerEventId: eventId, providerSubscriptionId: id, externalReference, status: mapStatus(resource.status), amountCents: cents(recurring.transaction_amount), currentPeriodStart: date(recurring.start_date), currentPeriodEnd: date(resource.next_payment_date) ?? date(recurring.end_date), paidAt: null, providerPaymentId: null, eventType };
  }

  private paymentSnapshot(resource: JsonRecord, eventId: string, eventType: string): ProviderSubscriptionSnapshot {
    const metadata = resource.metadata && typeof resource.metadata === "object" ? object(resource.metadata) : {};
    const externalReference = string(resource.external_reference);
    const providerSubscriptionId = string(metadata.preapproval_id) ?? string(resource.subscription_id);
    const paymentId = resource.id === undefined ? null : String(resource.id);
    if (!externalReference || !providerSubscriptionId || !paymentId) throw new Error("Pagamento do provedor sem vínculo de assinatura.");
    return { providerEventId: eventId, providerSubscriptionId, externalReference, status: mapStatus(resource.status), amountCents: cents(resource.transaction_amount), currentPeriodStart: null, currentPeriodEnd: null, paidAt: date(resource.date_approved), providerPaymentId: paymentId, eventType };
  }

  async getSubscriptionStatus(id: string): Promise<ProviderSubscriptionSnapshot> {
    return this.subscriptionSnapshot(await this.request(`/preapproval/${encodeURIComponent(id)}`), `poll:subscription:${id}:${this.now().toISOString()}`, "subscription.poll");
  }
  async getPaymentStatus(id: string): Promise<ProviderSubscriptionSnapshot> {
    return this.paymentSnapshot(await this.request(`/v1/payments/${encodeURIComponent(id)}`), `poll:payment:${id}:${this.now().toISOString()}`, "payment.poll");
  }
  async cancelSubscription(id: string): Promise<void> { await this.request(`/preapproval/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }); }

  private validateSignature(request: WebhookRequest): void {
    const parts = Object.fromEntries(request.xSignature.split(",").map(part => part.trim().split("=")).filter(pair => pair.length === 2));
    const timestamp = parts.ts;
    const received = parts.v1;
    if (!timestamp || !received || !/^[a-f0-9]{64}$/i.test(received)) throw new Error("Assinatura de webhook ausente ou inválida.");
    const seconds = Number(timestamp);
    if (!Number.isFinite(seconds) || Math.abs(this.now().getTime() - seconds * 1000) > 5 * 60_000) throw new Error("Webhook fora da janela temporal permitida.");
    const manifest = `id:${request.dataId.toLowerCase()};request-id:${request.xRequestId};ts:${timestamp};`;
    const expected = createHmac("sha256", this.config.MERCADO_PAGO_WEBHOOK_SECRET).update(manifest).digest();
    const actual = Buffer.from(received, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Assinatura de webhook inválida.");
  }

  async processWebhook(request: WebhookRequest): Promise<ProviderSubscriptionSnapshot> {
    this.validateSignature(request);
    const body = object(request.body);
    const type = string(body.type) ?? string(body.topic) ?? "unknown";
    const eventId = string(body.id) ?? `${type}:${request.dataId}:${request.xRequestId}`;
    if (type.includes("payment")) return this.paymentSnapshot(await this.request(`/v1/payments/${encodeURIComponent(request.dataId)}`), eventId, type);
    return this.subscriptionSnapshot(await this.request(`/preapproval/${encodeURIComponent(request.dataId)}`), eventId, type);
  }
}
