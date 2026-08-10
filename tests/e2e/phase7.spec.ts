import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousAccessibilityViolations } from "./accessibility";

async function installReportsMock(page: Page) {
  await page.addInitScript(() => {
    type Value = Record<string, unknown>;
    const titles: Record<string, string> = { MONTHLY_SUMMARY: "Resumo financeiro mensal", EXPENSES_BY_CATEGORY: "Despesas por categoria", SALES: "Vendas por período" };
    const invoke = async (command: string, args: Value = {}) => {
      if (command === "onboarding_status") return { isCompleted: true, licenseStatus: "ACTIVE" };
      if (command === "phase2_status") return { licenseStatus: "ACTIVE", licenseEdition: "ESSENTIAL", licenseCustomer: "Teste", authorizedMajorVersion: 1, installationId: "test", demoDataLoaded: false, trialExpired: false, trialEndsAt: null, trialEntryLimit: null, trialUsageCount: 0, trialRemainingEntries: null };
      if (command === "report_options") return { businessName: "Loja Teste", defaultRegime: "CASH", hasLogo: true, contacts: [{ id: "customer", name: "Maria Cliente", detail: "CUSTOMER" }], categories: [{ id: "expense", name: "Marketing", detail: "EXPENSE" }], accounts: [{ id: "account", name: "Conta principal", detail: "BANK" }], paymentMethods: [{ id: "pix", name: "Pix", detail: "PIX" }] };
      if (command === "preview_report") {
        const query = args.query as Value;
        const category = query.reportType === "EXPENSES_BY_CATEGORY";
        const columns = category ? [{ key: "category", label: "Categoria", kind: "TEXT" }, { key: "amount", label: "Valor", kind: "MONEY" }, { key: "percentage", label: "Participação", kind: "PERCENT" }] : [{ key: "month", label: "Mês", kind: "MONTH" }, { key: "revenue", label: "Faturamento", kind: "MONEY" }, { key: "expenses", label: "Despesas", kind: "MONEY" }, { key: "result", label: "Resultado", kind: "MONEY" }];
        const cells = category ? [{ raw: "Marketing" }, { raw: "45000" }, { raw: "7500" }] : [{ raw: "2026-08" }, { raw: "120000" }, { raw: "60000" }, { raw: "60000" }];
        return { reportType: query.reportType, title: titles[String(query.reportType)] ?? "Resumo financeiro mensal", businessName: "Loja Teste", generatedAt: "2026-08-05T15:00:00Z", startDate: query.startDate, endDate: query.endDate, regime: query.regime, filtersSummary: "Período selecionado", columns, rows: [{ id: "row", cells }], totals: [{ label: "Resultado", kind: "MONEY", raw: "60000" }], totalRows: 1, layoutNotice: "Todas as colunas são mantidas no PDF A4." };
      }
      if (command === "plugin:dialog|save") return "C:\\Temp\\Relatorio.pdf";
      if (command === "export_report_pdf" || command === "export_report_csv") { (window as unknown as { exports: string[] }).exports.push(command); return null; }
      throw new Error(`Comando não simulado: ${command}`);
    };
    (window as unknown as { exports: string[] }).exports = [];
    (window as unknown as { printCalls: number }).printCalls = 0;
    window.print = () => { (window as unknown as { printCalls: number }).printCalls += 1; };
    (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invoke } }).__TAURI_INTERNALS__ = { invoke };
  });
}

test("oferece os 17 relatórios, filtros e pré-visualização com totais", async ({ page }) => {
  await installReportsMock(page); await page.goto("/relatorios");
  await expect(page.getByRole("heading", { name: "Central de relatórios" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Catálogo de relatórios" }).getByRole("button")).toHaveCount(17);
  await page.getByRole("button", { name: /Despesas por categoria/ }).click();
  await page.getByLabel("Categoria").selectOption("expense");
  await page.getByRole("button", { name: "Visualizar" }).click();
  await expect(page.getByRole("heading", { name: "Despesas por categoria" }).last()).toBeVisible();
  await expect(page.getByText("R$ 450,00")).toBeVisible();
  await expect(page.getByText("75%")).toBeVisible();
  await page.getByRole("button", { name: "Valor", exact: true }).click();
  await expect(page.getByText("1 registro(s)")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("exporta PDF e CSV e oferece impressão da prévia", async ({ page }) => {
  await installReportsMock(page); await page.goto("/relatorios");
  await page.getByRole("button", { name: "Visualizar" }).click();
  await page.getByRole("button", { name: "PDF" }).click();
  await expect(page.getByText("Relatório PDF salvo com sucesso.")).toBeVisible();
  await page.getByRole("button", { name: "CSV" }).click();
  await expect(page.getByText("Relatório CSV salvo com sucesso.")).toBeVisible();
  await page.getByRole("button", { name: "Imprimir" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printCalls: number }).printCalls)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as unknown as { exports: string[] }).exports)).toEqual(["export_report_pdf", "export_report_csv"]);
});
