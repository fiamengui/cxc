import { describe, expect, it } from "vitest";
import { formatReportValue, reportFileName } from "./reports";

describe("relatórios", () => {
  it("formata valores contábeis e datas para pt-BR", () => {
    expect(formatReportValue("-123450", "MONEY")).toContain("1.234,50");
    expect(formatReportValue("2026-08-05", "DATE")).toBe("05/08/2026");
    expect(formatReportValue("6250", "PERCENT")).toBe("62,5%");
    expect(formatReportValue("PARTIALLY_RECEIVED", "STATUS")).toBe("Parcialmente recebida");
  });

  it("gera nome de arquivo portátil", () => {
    expect(reportFileName("Despesas por categoria", "pdf")).toBe("Despesas-por-categoria.pdf");
  });
});
