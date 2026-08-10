import { describe, expect, it } from "vitest";
import {
  calculateSaleTotals,
  parseQuantityToMillis,
  quantityInput,
} from "./sales";

describe("regras comerciais", () => {
  it("converte quantidades sem usar ponto flutuante no contrato", () => {
    expect(parseQuantityToMillis("1")).toBe(1_000);
    expect(parseQuantityToMillis("1,25")).toBe(1_250);
    expect(parseQuantityToMillis("0,001")).toBe(1);
    expect(quantityInput(1_250)).toBe("1,25");
  });

  it("calcula bruto, descontos, taxa e líquido", () => {
    const result = calculateSaleTotals(
      [{ quantityMillis: 2_000, unitPriceCents: 10_000, discountCents: 500 }],
      500,
      200,
    );
    expect(result).toMatchObject({
      grossAmountCents: 20_000,
      discountAmountCents: 1_000,
      feeAmountCents: 200,
      netAmountCents: 18_800,
      lineTotals: [19_500],
    });
  });

  it("arredonda o total da linha para o centavo mais próximo", () => {
    expect(
      calculateSaleTotals(
        [{ quantityMillis: 1_005, unitPriceCents: 999, discountCents: 0 }],
        0,
        0,
      ).lineTotals,
    ).toEqual([1_004]);
  });

  it("recusa quantidade, desconto e total inválidos", () => {
    expect(Number.isNaN(parseQuantityToMillis("1,2345"))).toBe(true);
    expect(() =>
      calculateSaleTotals(
        [{ quantityMillis: 1_000, unitPriceCents: 100, discountCents: 101 }],
        0,
        0,
      ),
    ).toThrow();
  });
});
