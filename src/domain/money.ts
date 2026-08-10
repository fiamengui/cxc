const moneyPattern = /^\d{1,3}(?:\.\d{3})*,\d{2}$|^\d+,\d{2}$/;

export function parseBrlToCents(value: string): number {
  const normalized = value.trim().replace(/^R\$\s?/, "");
  if (!moneyPattern.test(normalized)) throw new Error("Informe um valor monetário válido com duas casas decimais.");
  const [whole, decimals] = normalized.replaceAll(".", "").split(",");
  const cents = Number(whole) * 100 + Number(decimals);
  if (!Number.isSafeInteger(cents)) throw new Error("Valor monetário fora do limite aceito.");
  return cents;
}

export function formatCents(value: number): string {
  if (!Number.isSafeInteger(value)) throw new Error("O valor em centavos deve ser um inteiro seguro.");
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}
