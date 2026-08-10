import { expect, test } from "@playwright/test";
import { expectNoSeriousAccessibilityViolations } from "./accessibility";

test("limite comercial preserva consultas e apresenta ativação profissional", async ({ page }) => {
  await page.addInitScript(() => {
    const invoke = async (command: string) => {
      if (command === "onboarding_status") return { isCompleted: true, licenseStatus: "TRIAL" };
      if (command === "phase2_status") return {
        appVersion: "1.0.2",
        licenseStatus: "TRIAL_LIMIT_REACHED",
        licenseEdition: "ESSENTIAL",
        licenseCustomer: null,
        authorizedMajorVersion: null,
        installationId: "CNC-38DF-92A1-771B",
        licenseId: null,
        licenseIssuedAt: null,
        licenseProduct: null,
        licenseSchemaVersion: null,
        enabledFeatures: ["financial_core", "reports", "backup"],
        canCreateFinancialOperation: false,
        demoDataLoaded: false,
        trialExpired: true,
        trialEndsAt: null,
        trialEntryLimit: 50,
        trialUsageCount: 50,
        trialRemainingEntries: 0,
        subscriptionState: "TRIAL",
        subscriptionPlanCode: null,
        subscriptionValidUntil: null,
        subscriptionRequiresOnlineValidation: false,
      };
      if (command === "run_automatic_backup") return null;
      if (command === "open_user_manual") return null;
      throw new Error(`Comando não simulado: ${command}`);
    };
    (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invoke } }).__TAURI_INTERNALS__ = { invoke };
  });
  await page.goto("/ajuda");
  await expect(page.getByText("50 de 50 movimentações gratuitas utilizadas")).toBeVisible();
  await expect(page.getByText(/Consultas e relatórios continuam disponíveis/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver planos e assinar" })).toBeVisible();
  await expect(page.getByText(/R\$ 99,90/)).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});
