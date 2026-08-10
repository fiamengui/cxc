import { expect, test } from "@playwright/test";
import { expectNoSeriousAccessibilityViolations } from "./accessibility";

test("percorre as nove etapas do primeiro acesso sem perder os dados", async ({ page }) => {
  await page.goto("/?firstRun=1");
  await expect(page.getByText("BratecInfo", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restaurar backup" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meu plano" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Anual.*R\$\s*99,90/ })).toBeVisible();
  await expect(page.getByLabel("Recebeu um convite para a beta?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ativar convite beta" })).toBeVisible();
  await page.getByRole("button", { name: "Começar configuração" }).click();

  await expect(page.getByLabel(/Etapa 1 de 9/)).toBeVisible();
  await page.getByLabel("Nome do negócio").fill("Oficina Central");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Tipo de negócio").selectOption("REPAIR");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByLabel("Nome da conta financeira")).toHaveValue("Caixa");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo inicial (R$)").fill("1.250,50");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByLabel("Vendas")).toBeChecked();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByLabel("Pix")).toBeChecked();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Meta de receita (R$)").fill("10.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Seu nome").fill("Maria Silva");
  await page.getByLabel("Usuário").fill("maria.silva");
  await page.locator('input[name="password"]').fill("senha-segura-123");
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByLabel(/Etapa 9 de 9/)).toBeVisible();
  await expect(page.getByText("Oficina Central", { exact: true })).toBeVisible();
  await expect(page.getByText("Caixa · R$ 1.250,50", { exact: true })).toBeVisible();
  await expect(page.getByText(/Ao começar sem licença ativa, você poderá registrar 50 movimentações/)).toBeVisible();
  await expect(page.getByLabel("Carregar dados demonstrativos")).toBeChecked();
  await expectNoSeriousAccessibilityViolations(page);

  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page.getByLabel("Seu nome")).toHaveValue("Maria Silva");
});
