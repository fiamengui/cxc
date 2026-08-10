import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousAccessibilityViolations } from "./accessibility";

async function installManagementMock(page: Page) {
  await page.addInitScript(() => {
    type Value = Record<string, unknown>;
    let targets = {
      revenue: 200_000,
      expenses: 90_000,
      result: 110_000,
      sales: 12,
      customers: 4,
    };
    const metric = (
      target: number | null,
      actual: number,
      previousActual: number,
      isLimit = false,
    ) => ({
      target,
      actual,
      previousActual,
      difference: target === null ? null : target - actual,
      progressBasisPoints:
        target === null || target === 0
          ? null
          : Math.round((actual * 10_000) / target),
      dailyCalendarAmount:
        target === null ? null : Math.max(0, target - actual) / 20,
      dailyBusinessAmount:
        target === null ? null : Math.max(0, target - actual) / 14,
      isLimit,
    });
    const goal = () => ({
      referenceMonth: "2026-08",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      calendarDaysRemaining: 20,
      businessDaysRemaining: 14,
      revenue: metric(targets.revenue, 120_000, 100_000),
      expenses: metric(targets.expenses, 60_000, 55_000, true),
      result: metric(targets.result, 60_000, 45_000),
      sales: metric(targets.sales, 7, 5),
      newCustomers: metric(targets.customers, 3, 2),
    });
    const listItem = (
      id: string,
      listKind: string,
      title: string,
      amountCents: number,
      status: string,
    ) => ({
      id,
      listKind,
      title,
      subtitle: "Maria Cliente",
      date: "2026-08-04",
      dueDate: "2026-08-10",
      amountCents,
      status,
      originType: "MANUAL",
      originId: null,
      contactId: "customer",
      recurrenceId: null,
    });
    const dashboard = {
      businessName: "Loja Teste",
      userName: "Maria Gestora",
      startDate: "2026-08-01",
      endDate: "2026-08-05",
      previousStartDate: "2026-07-27",
      previousEndDate: "2026-07-31",
      availableBalance: { currentCents: 250_000, previousCents: 200_000 },
      receivedInflow: { currentCents: 120_000, previousCents: 100_000 },
      paidOutflow: { currentCents: 60_000, previousCents: 50_000 },
      periodResult: { currentCents: 60_000, previousCents: 50_000 },
      totalReceivable: { currentCents: 85_000, previousCents: null },
      totalPayable: { currentCents: 40_000, previousCents: null },
      totalOverdue: { currentCents: 15_000, previousCents: null },
      goalProgressBasisPoints: 6_000,
      goalTargetCents: 200_000,
      goalActualCents: 120_000,
      goalDailyBusinessCents: 5_715,
      points: [
        {
          key: "2026-08-01",
          startDate: "2026-08-01",
          endDate: "2026-08-01",
          openingBalanceCents: 190_000,
          inflowCents: 50_000,
          outflowCents: 10_000,
          closingBalanceCents: 230_000,
        },
        {
          key: "2026-08-02",
          startDate: "2026-08-02",
          endDate: "2026-08-02",
          openingBalanceCents: 230_000,
          inflowCents: 70_000,
          outflowCents: 50_000,
          closingBalanceCents: 250_000,
        },
      ],
      expenseCategories: [
        {
          categoryId: "marketing",
          name: "Marketing",
          amountCents: 45_000,
          percentageBasisPoints: 7_500,
        },
        {
          categoryId: "office",
          name: "Escritório",
          amountCents: 15_000,
          percentageBasisPoints: 2_500,
        },
      ],
      upcomingPayables: [
        listItem("payable", "PAYABLE", "Internet", 20_000, "PENDING"),
      ],
      upcomingReceivables: [
        listItem("receivable", "RECEIVABLE", "Projeto mensal", 35_000, "PENDING"),
      ],
      overdueAccounts: [
        listItem("overdue", "RECEIVABLE", "Mensalidade vencida", 15_000, "OVERDUE"),
      ],
      largestExpenses: [
        listItem("expense", "EXPENSE", "Campanha agosto", 45_000, "SETTLED"),
      ],
      latestMovements: [
        listItem("latest", "REVENUE", "Consultoria", 50_000, "SETTLED"),
      ],
    };
    const invoke = async (command: string, args: Value = {}) => {
      if (command === "onboarding_status")
        return { isCompleted: true, licenseStatus: "ACTIVE" };
      if (command === "phase2_status")
        return {
          licenseStatus: "ACTIVE",
          licenseEdition: "ESSENTIAL",
          licenseCustomer: "Teste",
          authorizedMajorVersion: 1,
          installationId: "test",
          demoDataLoaded: false,
          trialExpired: false,
          trialEndsAt: null,
          trialEntryLimit: null,
          trialUsageCount: 0,
          trialRemainingEntries: null,
        };
      if (command === "management_dashboard") return dashboard;
      if (command === "management_goal") return goal();
      if (command === "save_management_goal") {
        const input = args.input as Value;
        targets = {
          revenue: Number(input.revenueGoalCents),
          expenses: Number(input.expenseLimitCents),
          result: Number(input.resultGoalCents),
          sales: Number(input.salesCountGoal),
          customers: Number(input.newCustomersGoal),
        };
        return goal();
      }
      throw new Error(`Comando não simulado: ${command}`);
    };
    (
      window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invoke } }
    ).__TAURI_INTERNALS__ = { invoke };
  });
}

test("consulta dashboard gerencial completo e abre as metas do período", async ({
  page,
}) => {
  await installManagementMock(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Loja Teste" })).toBeVisible();
  await expect(page.getByText("Saldo total disponível")).toBeVisible();
  await expect(page.getByText("R$ 2.500,00", { exact: true })).toBeVisible();
  await expect(page.getByText("+25% ante o período anterior")).toBeVisible();
  await expect(page.getByRole("img", { name: "Gráfico de linha da evolução do saldo" })).toBeVisible();
  await expect(page.getByText("Marketing")).toBeVisible();
  await expect(page.getByText("R$ 450,00 · 75%")).toBeVisible();
  await expect(page.getByText("Média necessária por dia útil", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Próximas contas a pagar" })).toBeVisible();
  await expect(page.getByText("Internet", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contas atrasadas" })).toBeVisible();

  await page.getByRole("button", { name: /Progresso da meta/ }).click();
  await expect(page).toHaveURL(/\/metas\?month=2026-08$/);
  await expect(page.getByRole("heading", { name: "Metas" })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("salva as cinco metas e recalcula realizado, diferença e ritmo", async ({
  page,
}) => {
  await installManagementMock(page);
  await page.goto("/metas?month=2026-08");

  await expect(page.getByText("Despesas representam um teto", { exact: false })).toBeVisible();
  await page.getByLabel("Meta de faturamento (R$)").fill("3.000,00");
  await page.getByLabel("Limite de despesas (R$)").fill("1.000,00");
  await page.getByLabel("Meta de resultado (R$)").fill("2.000,00");
  await page.getByLabel("Quantidade de vendas").fill("20");
  await page.getByLabel("Novos clientes").fill("8");
  await page.getByRole("button", { name: "Salvar metas" }).click();

  await expect(page.getByText("Metas mensais salvas e indicadores recalculados.")).toBeVisible();
  await expect(page.getByText("de R$ 3.000,00")).toBeVisible();
  await expect(page.getByText("de R$ 1.000,00")).toBeVisible();
  await expect(page.getByText("Diferença: R$ 1.800,00")).toBeVisible();
  await expect(page.getByText("Disponível por dia útil", { exact: false })).toBeVisible();
  await expect(page.getByText("Necessário por dia útil", { exact: false }).first()).toBeVisible();
});
