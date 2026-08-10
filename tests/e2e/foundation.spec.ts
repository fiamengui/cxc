import { expect, test } from "@playwright/test";

test("exibe a fundação do CaixaSimples - Bratec", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CaixaSimples - Bratec" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
});
