import { describe, expect, it } from "vitest";
import { addMonthsClamped, splitInstallmentCents } from "./finance";

describe("regras financeiras da interface", () => {
  it("preserva o total e coloca os centavos restantes na última parcela", () => {
    const values = splitInstallmentCents(10_000, 3);
    expect(values).toEqual([3_333, 3_333, 3_334]);
    expect(values.reduce((sum, value) => sum + value, 0)).toBe(10_000);
  });

  it("aceita parcela única sem alterar o valor", () => {
    expect(splitInstallmentCents(12_345, 1)).toEqual([12_345]);
  });

  it("reconcilia exatamente todos os parcelamentos suportados", () => {
    for (let count = 1; count <= 120; count += 1) {
      const total = 1_234_567 + count;
      const values = splitInstallmentCents(total, count);
      expect(values).toHaveLength(count);
      expect(values.every((value) => Number.isSafeInteger(value) && value > 0)).toBe(true);
      expect(values.reduce((sum, value) => sum + value, 0)).toBe(total);
      const base = Math.floor(total / count);
      expect(values.slice(0, -1).every((value) => value === base)).toBe(true);
      expect(values.at(-1)).toBe(base + (total % count));
    }
  });

  it("ajusta vencimentos para o último dia de meses mais curtos", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonthsClamped("2026-03-31", 1)).toBe("2026-04-30");
  });

  it("rejeita entradas fora dos limites do domínio", () => {
    expect(() => splitInstallmentCents(0, 2)).toThrow();
    expect(() => splitInstallmentCents(2, 3)).toThrow();
    expect(() => splitInstallmentCents(100, 121)).toThrow();
    expect(() => addMonthsClamped("2026-02-30", 1)).toThrow();
  });
});
