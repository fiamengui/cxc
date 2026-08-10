import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export type Page<T> = { items: T[]; total: number };
export type ListQuery = {
  search: string;
  filter: string;
  status: string;
  limit: number;
  offset: number;
};
export type ContactInput = {
  id: string | null;
  name: string;
  contactKind: "PERSON" | "COMPANY";
  roleCustomer: boolean;
  roleSupplier: boolean;
  tradeName: string | null;
  documentNumber: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  notes: string | null;
  tags: string[];
};
export type ContactSummary = Pick<
  ContactInput,
  | "id"
  | "name"
  | "contactKind"
  | "roleCustomer"
  | "roleSupplier"
  | "documentNumber"
  | "phone"
  | "city"
> & {
  id: string;
  isActive: boolean;
  isDemo: boolean;
  totalMovedCents: number;
  receivableCents: number;
  payableCents: number;
  lastMovementAt: string | null;
};
export type AuditEntry = { action: string; summary: string; createdAt: string };
export type ContactFinancialEntry = {
  id: string;
  entryType: string;
  description: string;
  issueDate: string;
  dueDate: string | null;
  grossAmountCents: number;
  remainingAmountCents: number;
  displayStatus: string;
};
export type ContactSale = {
  id: string;
  number: string;
  issueDate: string;
  description: string;
  netAmountCents: number;
  receivedAmountCents: number;
  remainingAmountCents: number;
  status: string;
};
export type ContactDetail = Omit<ContactInput, "id"> & {
  id: string;
  isActive: boolean;
  isDemo: boolean;
  totalMovedCents: number;
  receivableCents: number;
  payableCents: number;
  lastMovementAt: string | null;
  history: AuditEntry[];
  financialEntries: ContactFinancialEntry[];
  sales: ContactSale[];
};
export type DuplicateCandidate = { id: string; name: string; reason: string };
export type CategoryInput = {
  id: string | null;
  name: string;
  nature: "REVENUE" | "EXPENSE";
  parentId: string | null;
  colorReference: string | null;
  iconReference: string | null;
};
export type AccountInput = {
  id: string | null;
  name: string;
  accountType: string;
  institution: string | null;
  openingBalanceCents: number;
  openingBalanceDate: string;
  colorReference: string | null;
  isDefault: boolean;
};
export type PaymentMethodInput = {
  id: string | null;
  name: string;
  paymentType: string;
  defaultFeeBasisPoints: number;
  defaultReceiptDelayDays: number;
};
export type ReferenceItem = {
  id: string;
  name: string;
  detail: string;
  isActive: boolean;
  isSystem: boolean;
  parentId: string | null;
  institution: string | null;
  amountCents: number | null;
  date: string | null;
  colorReference: string | null;
  isDefault: boolean;
  feeBasisPoints: number | null;
  receiptDelayDays: number | null;
};
export type CatalogItemInput = {
  id: string | null;
  name: string;
  itemType: "PRODUCT" | "SERVICE";
  code: string | null;
  description: string | null;
  category: string | null;
  salePriceCents: number;
  costPriceCents: number | null;
  unit: string;
};
export type CatalogItem = Omit<CatalogItemInput, "id"> & {
  id: string;
  isActive: boolean;
  isDemo: boolean;
};
export type CsvFilePreview = {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
};
export type ContactCsvMapping = {
  name: string;
  contactKind: string | null;
  roleCustomer: string | null;
  roleSupplier: string | null;
  tradeName: string | null;
  documentNumber: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  notes: string | null;
  tags: string | null;
};
export type ContactImportRow = {
  line: number;
  name: string;
  documentNumber: string | null;
  errors: string[];
  possibleDuplicates: string[];
};
export type ContactImportPreview = {
  rows: ContactImportRow[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
};

export const listContacts = (query: ListQuery) =>
  invoke<Page<ContactSummary>>("list_contacts", { query });
export const getContact = (id: string) =>
  invoke<ContactDetail>("get_contact", { id });
export const findContactDuplicates = (input: ContactInput) =>
  invoke<DuplicateCandidate[]>("contact_duplicates", { input });
export const saveContact = (input: ContactInput) =>
  invoke<string>("save_contact", { input });
export const listReferenceData = (resource: string) =>
  invoke<ReferenceItem[]>("list_reference_data", { resource });
export const saveCategory = (input: CategoryInput) =>
  invoke<string>("save_category", { input });
export const saveAccount = (input: AccountInput) =>
  invoke<string>("save_account", { input });
export const savePaymentMethod = (input: PaymentMethodInput) =>
  invoke<string>("save_payment_method", { input });
export const listCatalog = (query: ListQuery) =>
  invoke<Page<CatalogItem>>("list_catalog", { query });
export const saveCatalogItem = (input: CatalogItemInput) =>
  invoke<string>("save_catalog_item", { input });
export const setMasterActive = (
  resource: string,
  id: string,
  active: boolean,
) => invoke<void>("set_master_active", { resource, id, active });
export const deleteMaster = (resource: string, id: string) =>
  invoke<void>("delete_master", { resource, id });
export const readContactCsv = (path: string) =>
  invoke<CsvFilePreview>("read_contact_csv", { path });
export const previewContactImport = (
  path: string,
  mapping: ContactCsvMapping,
) => invoke<ContactImportPreview>("preview_contact_import", { path, mapping });
export const importContacts = (
  path: string,
  mapping: ContactCsvMapping,
  allowDuplicates: boolean,
) =>
  invoke<{ imported: number }>("import_contacts", {
    path,
    mapping,
    allowDuplicates,
  });
export const createContactCsvTemplate = (path: string) =>
  invoke<void>("create_contact_csv_template", { path });
export const exportContacts = (path: string, query: ListQuery) =>
  invoke<number>("export_contacts", { path, query });

export async function chooseContactCsv() {
  const value = await open({
    multiple: false,
    filters: [{ name: "Contatos CSV", extensions: ["csv"] }],
  });
  return typeof value === "string" ? value : null;
}
export const chooseCsvDestination = (name: string) =>
  save({
    defaultPath: name,
    filters: [{ name: "Arquivo CSV", extensions: ["csv"] }],
  });
