import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousAccessibilityViolations } from "./accessibility";

async function installDistributionMock(page: Page) {
  await page.addInitScript(() => {
    let demoDataLoaded = false;
    const status = () => ({
      licenseStatus: "ACTIVE",
      licenseEdition: "ESSENTIAL",
      licenseCustomer: "Loja Horizonte",
      authorizedMajorVersion: 1,
      installationId: "phase10-test",
      demoDataLoaded,
      trialExpired: false,
      trialEndsAt: null,
      trialEntryLimit: null,
      trialUsageCount: 0,
      trialRemainingEntries: null,
    });
    const invoke = async (command: string) => {
      if (command === "onboarding_status")
        return { isCompleted: true, licenseStatus: "ACTIVE" };
      if (command === "phase2_status") return status();
      if (command === "run_automatic_backup") return null;
      if (command === "open_user_manual") return null;
      if (command === "load_demo_data") {
        demoDataLoaded = true;
        return status();
      }
      if (command === "remove_demo_data") {
        demoDataLoaded = false;
        return status();
      }
      if (command === "initial_configuration")
        return {
          businessName: "Loja Horizonte",
          businessType: "RETAIL",
          defaultViewRegime: "CASH",
          theme: "LIGHT",
          accountName: "Caixa",
          openingBalanceCents: 100_000,
          openingBalanceDate: "2026-08-01",
          categoryCount: 4,
          paymentMethodCount: 3,
          monthlyGoalCents: 500_000,
          adminName: "Maria Gestora",
          username: "maria",
        };
      throw new Error(`Comando não simulado: ${command}`);
    };
    (
      window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invoke } }
    ).__TAURI_INTERNALS__ = { invoke };
  });
}

test("central de ajuda pesquisa tópicos e abre o manual offline", async ({ page }) => {
  await installDistributionMock(page);
  await page.goto("/ajuda");
  await expect(page.getByRole("heading", { name: "Como podemos ajudar?" })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);

  await page.getByRole("searchbox", { name: "Pesquisar na ajuda" }).fill("backup");
  await expect(page.getByRole("heading", { name: "Backup e restauração" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vendas e parcelas" })).toHaveCount(0);

  await page.getByRole("button", { name: "Abrir manual completo" }).click();
  await expect(page.getByRole("status")).toContainText("Manual aberto");
});

test("configurações carrega e remove somente o pacote demonstrativo", async ({ page }) => {
  await installDistributionMock(page);
  await page.goto("/configuracoes");
  await expect(page.getByText("Não carregados", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Carregar dados demonstrativos" }).click();
  await expect(page.getByText("Carregados", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("carregado com sucesso");

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remover dados demonstrativos" }).click();
  await expect(page.getByText("Não carregados", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("registros reais foram preservados");
});

test("ajuda mantém layout íntegro em tela compacta", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await installDistributionMock(page);
  await page.goto("/ajuda");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
