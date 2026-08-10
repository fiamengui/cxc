import { describe, expect, it } from "vitest";
import { toUserMessage } from "./errors";

describe("mensagens de erro seguras", () => {
  it("traduz falha da ponte nativa sem expor detalhe técnico", () => {
    expect(
      toUserMessage(
        new TypeError("Cannot read properties of undefined (reading 'invoke')"),
      ),
    ).toContain("integração local");
  });

  it("orienta o usuário quando o SQLite está ocupado", () => {
    expect(toUserMessage("SQLITE_BUSY: database is locked")).toContain(
      "Aguarde alguns segundos",
    );
  });

  it("preserva validações de negócio compreensíveis", () => {
    expect(toUserMessage("O valor deve ser maior que zero.")).toBe(
      "O valor deve ser maior que zero.",
    );
  });

  it("oculta mensagens técnicas excessivas", () => {
    expect(toUserMessage(`InternalError at execute (${"x".repeat(400)})`)).toContain(
      "Não foi possível concluir",
    );
  });
});
