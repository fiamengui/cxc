import { createHash, randomBytes, randomUUID, verify } from "node:crypto";
import { FEATURES, PLANS, PRODUCT, planByCode, type EntitlementPayload, type PlanCode } from "./domain.js";
import { canonicalDeviceChallenge, EntitlementSigner, type SignedEntitlement } from "./entitlement.js";
import type { PaymentProvider } from "./payment-provider.js";
import type { CheckoutContextInput, CommercialRepository } from "./repository.js";

export class CommercialService {
  constructor(private readonly repository: CommercialRepository, private readonly provider: PaymentProvider, private readonly signer: EntitlementSigner, private readonly keyId: string, private readonly now: () => Date = () => new Date()) {}

  listPlans() { return Object.values(PLANS).map(plan => ({ ...plan })); }

  async createCheckout(input: Omit<CheckoutContextInput, "plan"> & { planCode: string }) {
    const plan = planByCode(input.planCode);
    const publicKey = Buffer.from(input.devicePublicKey, "base64");
    const fingerprint = createHash("sha256").update(publicKey).digest("hex");
    if (publicKey.length !== 32 || fingerprint !== input.deviceFingerprint) throw new Error("Identidade criptográfica do dispositivo inválida.");
    const context = await this.repository.createCheckoutContext({ ...input, plan });
    const checkout = await this.provider.createSubscription({ subscriptionId: context.subscription.id, customerEmail: context.customerEmail, installationCode: context.installationCode, plan });
    await this.repository.bindProviderSubscription(context.subscription.id, checkout.providerSubscriptionId);
    return { subscriptionId: context.subscription.id, checkoutUrl: checkout.checkoutUrl, status: "PAYMENT_PENDING" as const };
  }

  async createChallenge(installationCode: string, action: string, requestId: string) {
    if (action !== "entitlement.refresh" || !/^[a-zA-Z0-9._:-]{8,128}$/.test(requestId)) throw new Error("Solicitação de desafio inválida.");
    const installation = await this.repository.findInstallationByCode(installationCode);
    if (!installation || installation.status !== "ACTIVE") throw new Error("Instalação não reconhecida.");
    const nonce = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + 2 * 60_000);
    const challenge = await this.repository.createChallenge(installation.id, createHash("sha256").update(nonce).digest("hex"), expiresAt);
    return { challengeId: challenge.id, nonce, expiresAt: expiresAt.toISOString(), serverTime: this.now().toISOString(), action, requestId };
  }

  async refreshEntitlement(input: { installationCode: string; subscriptionId: string; challengeId: string; nonce: string; requestId: string; timestamp: string; action: string; signature: string }): Promise<SignedEntitlement> {
    const installation = await this.repository.findInstallationByCode(input.installationCode);
    if (!installation || installation.status !== "ACTIVE") throw new Error("Instalação não reconhecida.");
    const timestamp = new Date(input.timestamp);
    if (Number.isNaN(timestamp.getTime()) || Math.abs(this.now().getTime() - timestamp.getTime()) > 2 * 60_000) throw new Error("Resposta ao desafio fora da janela temporal.");
    const consumed = await this.repository.consumeChallenge(input.challengeId, installation.id, createHash("sha256").update(input.nonce).digest("hex"));
    if (!consumed) throw new Error("Desafio inválido, expirado ou já utilizado.");
    const message = canonicalDeviceChallenge(input);
    const publicKey = Buffer.from(installation.publicKey, "base64");
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const valid = publicKey.length === 32 && verify(null, Buffer.from(message), { key: Buffer.concat([spkiPrefix, publicKey]), format: "der", type: "spki" }, Buffer.from(input.signature, "base64"));
    if (!valid) throw new Error("Assinatura do dispositivo inválida.");

    const subscription = await this.repository.getSubscription(input.subscriptionId);
    if (!subscription || subscription.installationId !== installation.id) throw new Error("Assinatura não pertence a esta instalação.");
    if (subscription.status !== "ACTIVE" && subscription.status !== "GRACE_PERIOD") throw new Error("Assinatura sem direito de uso ativo.");
    const now = this.now();
    const plan = PLANS[subscription.planCode as PlanCode];
    const leaseLimit = new Date(now.getTime() + plan.offlineLeaseDays * 86_400_000);
    const validUntil = subscription.currentPeriodEnd && subscription.currentPeriodEnd < leaseLimit ? subscription.currentPeriodEnd : leaseLimit;
    if (validUntil <= now) throw new Error("Período contratado encerrado.");
    const sequence = await this.repository.nextEntitlementSequence(subscription.id);
    const id = randomUUID();
    const payload: EntitlementPayload = { entitlementId:id, customerId:subscription.customerId, installationId:installation.id, devicePublicKeyFingerprint:installation.fingerprint, product:PRODUCT, edition:"ESSENTIAL", planCode:subscription.planCode, features:FEATURES, subscriptionStatus:subscription.status, issuedAt:now.toISOString(), notBefore:now.toISOString(), validUntil:validUntil.toISOString(), serverSequence:sequence, schemaVersion:1, keyId:this.keyId, trustedServerTime:now.toISOString() };
    const document = this.signer.sign(payload);
    await this.repository.recordEntitlement({ id, subscriptionId:subscription.id, installationId:installation.id, edition:payload.edition, validFrom:now, validUntil, serverSequence:sequence, signedPayloadHash:this.signer.hash(document), keyId:this.keyId });
    return document;
  }

  async processWebhook(input: Parameters<PaymentProvider["processWebhook"]>[0]) {
    const snapshot = await this.provider.processWebhook(input);
    const subscription = await this.repository.getSubscription(snapshot.externalReference);
    if (!subscription) throw new Error("Evento não corresponde a uma assinatura interna.");
    const plan = PLANS[subscription.planCode];
    const expected = plan.amountCents;
    if (snapshot.amountCents > 0 && snapshot.amountCents !== expected) throw new Error("Valor confirmado diverge do plano contratado.");
    const adjusted = { ...snapshot };
    if (adjusted.status === "ACTIVE" && adjusted.paidAt) {
      adjusted.currentPeriodStart = adjusted.paidAt;
      adjusted.currentPeriodEnd = addBillingPeriod(adjusted.paidAt, plan.billingCycle);
    } else if (adjusted.status === "PAYMENT_FAILED" && subscription.status === "ACTIVE" && subscription.currentPeriodEnd) {
      const graceUntil = new Date(subscription.currentPeriodEnd.getTime() + plan.gracePeriodDays * 86_400_000);
      if (this.now() <= graceUntil) { adjusted.status = "GRACE_PERIOD"; adjusted.currentPeriodStart = subscription.currentPeriodStart; adjusted.currentPeriodEnd = graceUntil; }
    }
    return this.repository.applyProviderSnapshot(adjusted);
  }
}

function addBillingPeriod(start: Date, cycle: "MONTHLY" | "ANNUAL"): Date {
  const year = start.getUTCFullYear() + (cycle === "ANNUAL" ? 1 : 0);
  const month = start.getUTCMonth() + (cycle === "MONTHLY" ? 1 : 0);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay), start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds()));
}
