export type ReportKind = "MONEY" | "NUMBER" | "PERCENT" | "QUANTITY" | "DATE" | "MONTH" | "STATUS" | "TEXT";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");

export function formatReportValue(raw: string, kind: string) {
  if (kind === "MONEY") return money.format(Number(raw || 0) / 100);
  if (kind === "NUMBER") return number.format(Number(raw || 0));
  if (kind === "PERCENT") return `${(Number(raw || 0) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  if (kind === "QUANTITY") return (Number(raw || 0) / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  if (kind === "MONTH" && /^\d{4}-\d{2}$/.test(raw)) return `${raw.slice(5)}/${raw.slice(0, 4)}`;
  if (kind === "DATE" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw.slice(8)}/${raw.slice(5, 7)}/${raw.slice(0, 4)}`;
  if (kind === "STATUS") return ({ DRAFT: "Rascunho", PENDING: "Pendente", PARTIAL: "Parcial", SETTLED: "Liquidada", OVERDUE: "Atrasada", CANCELED: "Cancelada", REVERSED: "Estornada", REVENUE: "Receita", EXPENSE: "Despesa", REVERSAL: "Estorno", CONFIRMED: "Confirmada", PARTIALLY_RECEIVED: "Parcialmente recebida", RECEIVED: "Recebida", IMMEDIATE: "Imediato", FUTURE: "Futuro", INSTALLMENTS: "Parcelado", MIXED: "Misto" } as Record<string, string>)[raw] ?? raw;
  return raw || "—";
}

export function reportFileName(title: string, extension: "pdf" | "csv") {
  const slug = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "Relatorio"}.${extension}`;
}
