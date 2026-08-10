import { describe, expect, it } from "vitest";
import { formatCents, parseBrlToCents } from "./money";

describe("valores monetários", () => {
  it("converte BRL em centavos sem ponto flutuante", () => {
    expect(parseBrlToCents("R$ 1.299,90")).toBe(129990);
  });

  it("formata centavos como BRL", () => {
    expect(formatCents(12990)).toBe("R$ 129,90");
  });

  it("rejeita valores malformados", () => {
    expect(() => parseBrlToCents("129,9")).toThrow();
  });
});
