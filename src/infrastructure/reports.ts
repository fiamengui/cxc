import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { reportFileName } from "../domain/reports";

export type ReportQuery = { reportType: string; startDate: string; endDate: string; regime: "CASH" | "ACCRUAL"; contactId: string | null; categoryId: string | null; financialAccountId: string | null; paymentMethodId: string | null; status: string; sortBy: string; sortDirection: "ASC" | "DESC"; limit: number; offset: number };
export type ReportOption = { id: string; name: string; detail: string };
export type ReportOptions = { businessName: string; defaultRegime: "CASH" | "ACCRUAL"; hasLogo: boolean; contacts: ReportOption[]; categories: ReportOption[]; accounts: ReportOption[]; paymentMethods: ReportOption[] };
export type ReportColumn = { key: string; label: string; kind: string };
export type ReportResult = { reportType: string; title: string; businessName: string; generatedAt: string; startDate: string; endDate: string; regime: string; filtersSummary: string; columns: ReportColumn[]; rows: { id: string | null; cells: { raw: string }[] }[]; totals: { label: string; kind: string; raw: string }[]; totalRows: number; layoutNotice: string };

export const getReportOptions = () => invoke<ReportOptions>("report_options");
export const previewReport = (query: ReportQuery) => invoke<ReportResult>("preview_report", { query });

async function exportReport(command: string, query: ReportQuery, title: string, extension: "pdf" | "csv") {
  const path = await save({ defaultPath: reportFileName(title, extension), filters: [{ name: extension === "pdf" ? "Documento PDF" : "Planilha CSV", extensions: [extension] }] });
  if (!path) return null;
  await invoke<void>(command, { query, path });
  return path;
}

export const exportReportPdf = (query: ReportQuery, title: string) => exportReport("export_report_pdf", query, title, "pdf");
export const exportReportCsv = (query: ReportQuery, title: string) => exportReport("export_report_csv", query, title, "csv");
