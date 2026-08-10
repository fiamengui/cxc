export const PRODUCT = "CAIXA_NO_CONTROLE" as const;
export const FEATURES = ["financial_core", "contacts", "catalog", "sales", "reports", "backup", "goals"] as const;

export type PlanCode = "ESSENTIAL_MONTHLY" | "ESSENTIAL_ANNUAL";
export type SubscriptionState = "PAYMENT_PENDING" | "ACTIVE" | "GRACE_PERIOD" | "PAYMENT_FAILED" | "EXPIRED" | "CANCELED" | "REFUNDED";

export type Plan = {
  code: PlanCode;
  name: string;
  billingCycle: "MONTHLY" | "ANNUAL";
  amountCents: number;
  edition: "ESSENTIAL";
  offlineLeaseDays: number;
  gracePeriodDays: number;
};

export const PLANS: Readonly<Record<PlanCode, Plan>> = Object.freeze({
  ESSENTIAL_MONTHLY: { code: "ESSENTIAL_MONTHLY", name: "Caixa no Controle Essencial", billingCycle: "MONTHLY", amountCents: 990, edition: "ESSENTIAL", offlineLeaseDays: 7, gracePeriodDays: 5 },
  ESSENTIAL_ANNUAL: { code: "ESSENTIAL_ANNUAL", name: "Caixa no Controle Essencial", billingCycle: "ANNUAL", amountCents: 9990, edition: "ESSENTIAL", offlineLeaseDays: 30, gracePeriodDays: 10 },
});

export function planByCode(value: string): Plan {
  const plan = PLANS[value as PlanCode];
  if (!plan) throw new Error("Plano comercial inválido.");
  return plan;
}

export type SubscriptionRecord = {
  id: string;
  customerId: string;
  installationId: string;
  planCode: PlanCode;
  providerSubscriptionId: string | null;
  status: SubscriptionState;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
};

export type ProviderSubscriptionSnapshot = {
  providerEventId: string;
  providerSubscriptionId: string;
  externalReference: string;
  status: SubscriptionState;
  amountCents: number;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  paidAt: Date | null;
  providerPaymentId: string | null;
  eventType: string;
};

export type EntitlementPayload = {
  entitlementId: string;
  customerId: string;
  installationId: string;
  devicePublicKeyFingerprint: string;
  product: typeof PRODUCT;
  edition: "ESSENTIAL";
  planCode: PlanCode;
  features: readonly string[];
  subscriptionStatus: SubscriptionState;
  issuedAt: string;
  notBefore: string;
  validUntil: string;
  serverSequence: number;
  schemaVersion: 1;
  keyId: string;
  trustedServerTime: string;
};
