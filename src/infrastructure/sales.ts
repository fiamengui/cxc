import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { EntrySummary } from "./finance";

export type SaleItemInput = {
  catalogItemId: string | null;
  description: string;
  quantityMillis: number;
  unit: string;
  unitPriceCents: number;
  discountCents: number;
};

export type SaleInput = {
  id: string | null;
  customerId: string;
  categoryId: string;
  issueDate: string;
  description: string;
  discountAmountCents: number;
  feeAmountCents: number;
  receiptMode: "IMMEDIATE" | "FUTURE" | "INSTALLMENTS" | "MIXED";
  paymentMethodId: string;
  financialAccountId: string | null;
  installmentCount: number;
  firstDueDate: string;
  receivedNowCents: number;
  status: "DRAFT" | "CONFIRMED";
  notes: string | null;
  items: SaleItemInput[];
};

export type SaleSaveResult = {
  id: string;
  number: string;
  status: string;
  financialEntryIds: string[];
  idempotentReplay: boolean;
};

export type SaleSummary = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  categoryId: string;
  categoryName: string;
  issueDate: string;
  description: string;
  grossAmountCents: number;
  discountAmountCents: number;
  feeAmountCents: number;
  netAmountCents: number;
  receiptMode: string;
  paymentMethodId: string;
  paymentMethodName: string;
  financialAccountId: string | null;
  financialAccountName: string | null;
  installmentCount: number;
  firstDueDate: string;
  receivedNowCents: number;
  financialGroupId: string | null;
  status: string;
  notes: string | null;
  cancelReason: string | null;
  confirmedAt: string | null;
  canceledAt: string | null;
  receivedAmountCents: number;
  remainingAmountCents: number;
};

export type SaleItem = SaleItemInput & { id: string; totalCents: number };
export type SaleHistory = {
  action: string;
  summary: string;
  createdAt: string;
};
export type ReceiptBusiness = {
  name: string;
  documentNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  logoPath: string | null;
};
export type SaleDetail = SaleSummary & {
  items: SaleItem[];
  receivables: EntrySummary[];
  history: SaleHistory[];
  business: ReceiptBusiness;
};
export type SaleListQuery = {
  search: string;
  status: string;
  customerId: string | null;
  startDate: string | null;
  endDate: string | null;
  limit: number;
  offset: number;
};
export type Page<T> = { items: T[]; total: number };
export type SalesOption = {
  id: string;
  name: string;
  detail: string | null;
  amountCents: number | null;
  feeBasisPoints: number | null;
  receiptDelayDays: number | null;
};
export type SalesOptions = {
  customers: SalesOption[];
  catalogItems: SalesOption[];
  categories: SalesOption[];
  accounts: SalesOption[];
  paymentMethods: SalesOption[];
  defaultFinancialAccountId: string | null;
  defaultPaymentMethodId: string | null;
};

export const getSalesOptions = () => invoke<SalesOptions>("sales_options");
export const listSales = (query: SaleListQuery) =>
  invoke<Page<SaleSummary>>("list_sales", { query });
export const getSale = (id: string) => invoke<SaleDetail>("get_sale", { id });
export const saveSale = (input: SaleInput) =>
  invoke<SaleSaveResult>("save_sale", { input }).finally(() =>
    window.dispatchEvent(new Event("cnc-entitlement-changed")),
  );
export const cancelSale = (id: string, reason: string) =>
  invoke<void>("cancel_sale", { id, reason });
export async function exportSaleReceiptPdf(id: string, number: string) {
  const path = await save({
    defaultPath: `Comprovante-${number}.pdf`,
    filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
  });
  if (!path) return null;
  await invoke<void>("export_sale_receipt_pdf", { id, path });
  return path;
}
