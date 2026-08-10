import { expect, test } from "@playwright/test";

test("exibe a fundação do Caixa no Controle", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Caixa no Controle" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
});
