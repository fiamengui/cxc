import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousAccessibilityViolations } from "./accessibility";

async function installContinuityMock(page: Page) {
  await page.addInitScript(() => {
    type Value = Record<string, unknown>;
    let settings = { directory: "C:\\Backups", enabled: false, frequency: "WEEKLY", retentionCount: 12, lastBackupAt: null as string | null, due: false };
    const history: Value[] = [];
    const overview = () => ({ settings, history, databaseVersion: 10, databaseSizeBytes: 1_572_864, databaseIntegrity: "ok", foreignKeyViolations: 0, logFileCount: 2, logSizeBytes: 12_288, appVersion: "0.1.0", operatingSystem: "windows", architecture: "x86_64" });
    const backup = (path: string, protectedValue: boolean) => ({ path, businessName: "Loja Teste", appVersion: "0.1.0", generatedAtEpoch: 1_786_000_000, checksum: "abc123", protected: protectedValue, sizeBytes: 4096 });
    const invoke = async (command: string, args: Value = {}) => {
      if (command === "onboarding_status") return { isCompleted: true, licenseStatus: "ACTIVE" };
      if (command === "phase2_status") return { licenseStatus: "ACTIVE", licenseEdition: "ESSENTIAL", licenseCustomer: "Loja Teste", authorizedMajorVersion: 1, installationId: "installation-test", demoDataLoaded: false, trialExpired: false, trialEndsAt: null, trialEntryLimit: null, trialUsageCount: 0, trialRemainingEntries: null };
      if (command === "run_automatic_backup") return null;
      if (command === "continuity_overview") return overview();
      if (command === "save_backup_settings") { const input = args.input as Value; settings = { ...settings, directory: String(input.directory), enabled: Boolean(input.enabled), frequency: String(input.frequency), retentionCount: Number(input.retentionCount) }; return settings; }
      if (command === "plugin:dialog|save") { const serialized = JSON.stringify(args); return serialized.includes("cncdiag") ? "C:\\Temp\\diagnostico.cncdiag" : "C:\\Temp\\backup.cncbak"; }
      if (command === "plugin:dialog|open") { const serialized = JSON.stringify(args); if (serialized.includes("cncupd")) return "C:\\Temp\\update.cncupd"; if (serialized.includes("cncbak")) return "C:\\Temp\\backup.cncbak"; return "C:\\Backups"; }
      if (command === "create_backup") { const info = backup(String(args.path), Boolean(args.password)); settings = { ...settings, lastBackupAt: "2026-08-05T17:00:00Z" }; history.unshift({ id: "history-1", backupType: "MANUAL", path: args.path, protected: info.protected, status: "SUCCESS", sizeBytes: 4096, errorSummary: null, createdAt: "2026-08-05T17:00:00Z" }); return info; }
      if (command === "inspect_backup") { if (args.password !== "senha-segura") throw new Error("senha incorreta ou backup adulterado"); return backup(String(args.path), true); }
      if (command === "create_diagnostic_package") return null;
      if (command === "inspect_update") return { currentVersion: "0.1.0", version: "0.2.0", publishedAt: "2026-08-05", summary: "Correções de estabilidade e segurança.", majorUpgrade: false, licenseCompatible: true, installerFileName: "setup.exe" };
      if (command === "activate_license_file") throw new Error("não usado");
      throw new Error(`Comando não simulado: ${command}`);
    };
    (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invoke } }).__TAURI_INTERNALS__ = { invoke };
  });
}

test("configura retenção e cria backup manual protegido com histórico", async ({ page }) => {
  await installContinuityMock(page); await page.goto("/backup");
  await expect(page.getByRole("heading", { name: "Segurança e continuidade" })).toBeVisible();
  await expect(page.getByText("Íntegro")).toBeVisible();
  await page.getByLabel("Ativar backups automáticos").check();
  await page.getByLabel("Frequência do backup").selectOption("DAILY");
  await page.getByLabel("Quantidade de backups mantidos").fill("7");
  await page.getByRole("button", { name: "Salvar política" }).click();
  await expect(page.getByText("Política de backup automático salva.")).toBeVisible();
  await page.getByLabel("Proteger este backup com senha").check();
  await page.getByLabel("Senha do backup").fill("senha-segura");
  await page.getByRole("button", { name: "Criar backup agora" }).click();
  await expect(page.getByText("Backup criado, verificado e registrado.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Com senha" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Concluído" })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("valida restauração protegida, diagnóstico privado e atualização assinada", async ({ page }) => {
  await installContinuityMock(page); await page.goto("/backup");
  await page.getByRole("button", { name: "Selecionar arquivo" }).click();
  await page.getByLabel("Senha para restaurar").fill("senha-segura");
  await page.getByRole("button", { name: "Validar integridade" }).click();
  await expect(page.getByText("Integridade, manifesto e conteúdo validados.")).toBeVisible();
  await expect(page.getByText("Protegido por senha")).toBeVisible();
  await page.getByRole("button", { name: "Gerar pacote de diagnóstico" }).click();
  await expect(page.getByText("Pacote de diagnóstico criado sem o banco financeiro.")).toBeVisible();
  await page.getByRole("button", { name: "Verificar pacote de atualização" }).click();
  await expect(page.getByText("Versão 0.2.0")).toBeVisible();
  await expect(page.getByText("Licença compatível")).toBeVisible();
  await expect(page.getByText("Assinatura, versão e instalador da atualização validados.")).toBeVisible();
});
