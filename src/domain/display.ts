export const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function parseMoney(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(normalized)) {
    return Number.NaN;
  }
  const [whole, decimal = ""] = normalized.replaceAll(".", "").split(",");
  return Number(whole) * 100 + Number((decimal + "00").slice(0, 2));
}

export function centsInput(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return (value / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
