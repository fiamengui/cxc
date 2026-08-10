import type { Plan, ProviderSubscriptionSnapshot } from "./domain.js";

export type CheckoutInput = {
  subscriptionId: string;
  customerEmail: string;
  installationCode: string;
  plan: Plan;
};
export type CheckoutResult = { providerSubscriptionId: string; checkoutUrl: string };
export type WebhookRequest = { xSignature: string; xRequestId: string; dataId: string; body: unknown };

export interface PaymentProvider {
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  createSubscription(input: CheckoutInput): Promise<CheckoutResult>;
  getSubscriptionStatus(providerSubscriptionId: string): Promise<ProviderSubscriptionSnapshot>;
  getPaymentStatus(providerPaymentId: string): Promise<ProviderSubscriptionSnapshot>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  processWebhook(request: WebhookRequest): Promise<ProviderSubscriptionSnapshot>;
}
