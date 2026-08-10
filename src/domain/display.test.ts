import { describe, expect, it } from "vitest";
import { centsInput, parseMoney } from "./display";

describe("campos monetários dos cadastros", () => {
  it("converte a digitação brasileira diretamente para centavos", () => {
    expect(parseMoney("1.299,90")).toBe(129_990);
    expect(parseMoney("25")).toBe(2_500);
    expect(parseMoney("0,05")).toBe(5);
  });

  it("diferencia campo opcional vazio de valor inválido", () => {
    expect(parseMoney(" ")).toBeNull();
    expect(parseMoney("1,999")).toBeNaN();
    expect(parseMoney("12.34")).toBeNaN();
  });

  it("preenche formulários sem perder os centavos", () => {
    expect(centsInput(129_990)).toBe("1.299,90");
    expect(centsInput(null)).toBe("");
  });
});
