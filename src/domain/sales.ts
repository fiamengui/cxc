export type CalculableSaleItem = {
  quantityMillis: number;
  unitPriceCents: number;
  discountCents: number;
};

export function parseQuantityToMillis(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d+(?:[,.]\d{1,3})?$/.test(normalized)) return Number.NaN;
  const [whole, decimals = ""] = normalized.replace(",", ".").split(".");
  const result = Number(whole) * 1_000 + Number((decimals + "000").slice(0, 3));
  return Number.isSafeInteger(result) ? result : Number.NaN;
}

export function quantityInput(value: number): string {
  if (!Number.isSafeInteger(value) || value <= 0) return "";
  return (value / 1_000).toLocaleString("pt-BR", {
    minimumFractionDigits: value % 1_000 === 0 ? 0 : 1,
    maximumFractionDigits: 3,
  });
}

export function calculateSaleTotals(
  items: CalculableSaleItem[],
  saleDiscountCents: number,
  feeCents: number,
) {
  if (
    items.length === 0 ||
    !Number.isSafeInteger(saleDiscountCents) ||
    !Number.isSafeInteger(feeCents) ||
    saleDiscountCents < 0 ||
    feeCents < 0
  ) {
    throw new Error("Venda inválida.");
  }
  let grossAmountCents = 0;
  let itemDiscountCents = 0;
  const lineTotals = items.map((item) => {
    if (
      !Number.isSafeInteger(item.quantityMillis) ||
      !Number.isSafeInteger(item.unitPriceCents) ||
      !Number.isSafeInteger(item.discountCents) ||
      item.quantityMillis <= 0 ||
      item.unitPriceCents < 0 ||
      item.discountCents < 0
    ) {
      throw new Error("Item inválido.");
    }
    const lineGross = Math.round(
      (item.unitPriceCents * item.quantityMillis) / 1_000,
    );
    if (!Number.isSafeInteger(lineGross) || item.discountCents > lineGross) {
      throw new Error("Desconto do item inválido.");
    }
    grossAmountCents += lineGross;
    itemDiscountCents += item.discountCents;
    return lineGross - item.discountCents;
  });
  const discountAmountCents = itemDiscountCents + saleDiscountCents;
  const netAmountCents = grossAmountCents - discountAmountCents - feeCents;
  if (!Number.isSafeInteger(netAmountCents) || netAmountCents <= 0) {
    throw new Error("Descontos e taxas consomem o total da venda.");
  }
  return {
    grossAmountCents,
    itemDiscountCents,
    discountAmountCents,
    feeAmountCents: feeCents,
    netAmountCents,
    lineTotals,
  };
}
