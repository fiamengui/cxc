import { invoke } from "@tauri-apps/api/core";

export type EntryType =
  | "REVENUE"
  | "EXPENSE"
  | "OWNER_CONTRIBUTION"
  | "OWNER_WITHDRAWAL"
  | "ADJUSTMENT_POSITIVE"
  | "ADJUSTMENT_NEGATIVE";
export type EntryStatus = "DRAFT" | "PENDING" | "SETTLED";
export type RecurrenceInput = {
  frequency:
    | "WEEKLY"
    | "MONTHLY"
    | "BIMONTHLY"
    | "QUARTERLY"
    | "SEMIANNUAL"
    | "ANNUAL";
  intervalValue: number;
  startDate: string;
  endDate: string | null;
  maximumOccurrences: number | null;
};
export type EntryInput = {
  id: string | null;
  entryType: EntryType;
  originType: string;
  originId: string | null;
  contactId: string | null;
  categoryId: string | null;
  financialAccountId: string | null;
  paymentMethodId: string | null;
  description: string;
  documentReference: string | null;
  issueDate: string;
  competenceDate: string | null;
  dueDate: string | null;
  grossAmountCents: number;
  status: EntryStatus;
  installmentCount: number;
  installmentDueDates: string[];
  recurrence: RecurrenceInput | null;
  notes: string | null;
};
export type TransferInput = {
  description: string;
  amountCents: number;
  date: string;
  sourceAccountId: string;
  destinationAccountId: string;
  paymentMethodId: string;
  documentReference: string | null;
  notes: string | null;
};
export type SettlementInput = {
  entryId: string;
  settlementDate: string;
  financialAccountId: string;
  paymentMethodId: string;
  amountCents: number;
  discountAmountCents: number;
  feeAmountCents: number;
  interestAmountCents: number;
  penaltyAmountCents: number;
  notes: string | null;
};
export type SaveEntriesResult = {
  entryIds: string[];
  groupId: string | null;
  recurrenceId: string | null;
};
export type SettlementResult = {
  entryId: string;
  settlementId: string;
  status: string;
  remainingAmountCents: number;
};
export type EntrySummary = {
  id: string;
  entryGroupId: string | null;
  entryType: string;
  direction: "IN" | "OUT";
  originType: string;
  originId: string | null;
  contactId: string | null;
  contactName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  financialAccountId: string | null;
  financialAccountName: string | null;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  description: string;
  documentReference: string | null;
  issueDate: string;
  competenceDate: string;
  dueDate: string | null;
  settlementDate: string | null;
  grossAmountCents: number;
  netAmountCents: number;
  installmentNumber: number;
  installmentCount: number;
  persistedStatus: string;
  displayStatus: string;
  isRecurring: boolean;
  recurrenceId: string | null;
  notes: string | null;
  cancelReason: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  settledPrincipalCents: number;
  remainingAmountCents: number;
};
export type SettlementItem = {
  id: string;
  settlementDate: string;
  financialAccountId: string;
  financialAccountName: string;
  paymentMethodId: string;
  paymentMethodName: string;
  principalAmountCents: number;
  discountAmountCents: number;
  feeAmountCents: number;
  interestAmountCents: number;
  penaltyAmountCents: number;
  netAmountCents: number;
  notes: string | null;
  createdAt: string;
};
export type HistoryItem = {
  action: string;
  summary: string;
  createdAt: string;
};
export type EntryDetail = EntrySummary & {
  settlements: SettlementItem[];
  history: HistoryItem[];
};
export type FinanceOption = {
  id: string;
  name: string;
  detail: string | null;
  currentBalanceCents: number | null;
};
export type FinanceOptions = {
  businessName: string;
  defaultFinancialAccountId: string | null;
  defaultPaymentMethodId: string | null;
  defaultViewRegime: "CASH" | "ACCRUAL";
  contacts: FinanceOption[];
  categories: FinanceOption[];
  accounts: FinanceOption[];
  paymentMethods: FinanceOption[];
};
export type EntryListQuery = {
  tab: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  categoryId: string | null;
  financialAccountId: string | null;
  paymentMethodId: string | null;
  contactId: string | null;
  minimumAmountCents: number | null;
  maximumAmountCents: number | null;
  search: string;
  originType: string;
  limit: number;
  offset: number;
};
export type Page<T> = { items: T[]; total: number };
export type RecurrenceSummary = {
  id: string;
  description: string;
  frequency: string;
  intervalValue: number;
  startDate: string;
  endDate: string | null;
  nextGenerationDate: string | null;
  maximumOccurrences: number | null;
  generatedOccurrences: number;
  isActive: boolean;
};
export type ObligationQuery = {
  kind: "RECEIVABLE" | "PAYABLE";
  status: string;
  search: string;
  startDate: string | null;
  endDate: string | null;
  limit: number;
  offset: number;
};
export type ObligationIndicators = {
  totalPendingCents: number;
  overdueCents: number;
  dueTodayCents: number;
  nextSevenDaysCents: number;
  settledThisMonthCents: number;
};
export type ObligationPage = {
  items: EntrySummary[];
  total: number;
  indicators: ObligationIndicators;
};
export type CashFlowQuery = {
  startDate: string;
  endDate: string;
  financialAccountId: string | null;
  categoryId: string | null;
  regime: "CASH" | "ACCRUAL";
  status: string;
  projectionUntil: string | null;
  includePendingProjection: boolean;
};
export type CashFlowDay = {
  date: string;
  openingBalanceCents: number;
  inflowCents: number;
  outflowCents: number;
  dailyResultCents: number;
  closingBalanceCents: number;
};
export type CashFlowResult = {
  openingBalanceCents: number;
  inflowCents: number;
  outflowCents: number;
  resultCents: number;
  closingBalanceCents: number;
  projectedBalanceCents: number;
  projectedInflowCents: number;
  projectedOutflowCents: number;
  regime: string;
  days: CashFlowDay[];
};

export const getFinanceOptions = () =>
  invoke<FinanceOptions>("finance_options");
export const listFinancialEntries = (query: EntryListQuery) =>
  invoke<Page<EntrySummary>>("list_financial_entries", { query });
export const getFinancialEntry = (id: string) =>
  invoke<EntryDetail>("get_financial_entry", { id });
const refreshEntitlementAfter = <T,>(operation: Promise<T>) =>
  operation.finally(() => window.dispatchEvent(new Event("cnc-entitlement-changed")));
export const saveFinancialEntry = (input: EntryInput) =>
  refreshEntitlementAfter(invoke<SaveEntriesResult>("save_financial_entry", { input }));
export const settleFinancialEntry = (input: SettlementInput) =>
  invoke<SettlementResult>("settle_financial_entry", { input });
export const createFinancialTransfer = (input: TransferInput) =>
  refreshEntitlementAfter(invoke<SaveEntriesResult>("create_financial_transfer", { input }));
export const cancelFinancialEntry = (id: string, reason: string) =>
  invoke<void>("cancel_financial_entry", { id, reason });
export const rescheduleFinancialEntry = (id: string, dueDate: string) =>
  invoke<void>("reschedule_financial_entry", { id, dueDate });
export const reverseFinancialEntry = (
  id: string,
  reversalDate: string,
  reason: string,
) =>
  invoke<SaveEntriesResult>("reverse_financial_entry", {
    id,
    reversalDate,
    reason,
  });
export const listRecurrences = () =>
  invoke<RecurrenceSummary[]>("list_recurrences");
export const setRecurrenceActive = (id: string, active: boolean) =>
  invoke<void>("set_recurrence_active", { id, active });
export const generateRecurrences = (throughDate: string) =>
  refreshEntitlementAfter(invoke<number>("generate_recurrences", { throughDate }));
export const listObligations = (query: ObligationQuery) =>
  invoke<ObligationPage>("list_obligations", { query });
export const getFinancialCashFlow = (query: CashFlowQuery) =>
  invoke<CashFlowResult>("financial_cash_flow", { query });
