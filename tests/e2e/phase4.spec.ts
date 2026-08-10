import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousAccessibilityViolations } from "./accessibility";

async function installFinanceMock(page: Page) {
  await page.addInitScript(() => {
    type Value = Record<string, unknown>;
    const entries: Value[] = [];
    const recurrences: Value[] = [];
    let sequence = 0;
    const id = () => `finance-${++sequence}`;
    const options = {
      businessName: "Empresa Teste",
      defaultFinancialAccountId: "account-a",
      defaultPaymentMethodId: "pix",
      defaultViewRegime: "CASH",
      contacts: [
        {
          id: "contact",
          name: "Maria Cliente",
          detail: "BOTH",
          currentBalanceCents: null,
        },
      ],
      categories: [
        {
          id: "revenue",
          name: "Serviços",
          detail: "REVENUE",
          currentBalanceCents: null,
        },
        {
          id: "expense",
          name: "Fornecedores",
          detail: "EXPENSE",
          currentBalanceCents: null,
        },
      ],
      accounts: [
        {
          id: "account-a",
          name: "Caixa",
          detail: "CASH",
          currentBalanceCents: 100000,
        },
        {
          id: "account-b",
          name: "Banco",
          detail: "BANK",
          currentBalanceCents: 50000,
        },
      ],
      paymentMethods: [
        { id: "pix", name: "Pix", detail: "PIX", currentBalanceCents: null },
        {
          id: "transfer",
          name: "Transferência",
          detail: "TRANSFER",
          currentBalanceCents: null,
        },
      ],
    };
    const summary = (
      input: Value,
      amount: number,
      dueDate: string | null,
      installmentNumber = 1,
      installmentCount = 1,
      groupId: string | null = null,
    ): Value => ({
      id: id(),
      entryGroupId: groupId,
      entryType: input.entryType,
      direction: [
        "REVENUE",
        "OWNER_CONTRIBUTION",
        "ADJUSTMENT_POSITIVE",
        "TRANSFER_IN",
      ].includes(String(input.entryType))
        ? "IN"
        : "OUT",
      originType: "MANUAL",
      originId: null,
      contactId: input.contactId,
      contactName: input.contactId ? "Maria Cliente" : null,
      categoryId: input.categoryId,
      categoryName:
        input.categoryId === "revenue"
          ? "Serviços"
          : input.categoryId === "expense"
            ? "Fornecedores"
            : null,
      financialAccountId: input.financialAccountId,
      financialAccountName:
        input.financialAccountId === "account-b"
          ? "Banco"
          : input.financialAccountId
            ? "Caixa"
            : null,
      paymentMethodId: input.paymentMethodId,
      paymentMethodName: input.paymentMethodId ? "Pix" : null,
      description: input.description,
      documentReference: input.documentReference,
      issueDate: input.issueDate,
      competenceDate: input.competenceDate ?? input.issueDate,
      dueDate,
      settlementDate: input.status === "SETTLED" ? input.issueDate : null,
      grossAmountCents: amount,
      netAmountCents: amount,
      installmentNumber,
      installmentCount,
      persistedStatus: input.status,
      displayStatus: input.status,
      isRecurring: Boolean(input.recurrence),
      recurrenceId: null,
      notes: input.notes,
      cancelReason: null,
      reversedAt: null,
      reversalReason: null,
      settledPrincipalCents: input.status === "SETTLED" ? amount : 0,
      remainingAmountCents: input.status === "SETTLED" ? 0 : amount,
      settlements: [],
      history: [
        {
          action: "CREATE",
          summary: "Movimentação criada",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const list = (args: Value) => {
      const query = args.query as Value;
      const tab = String(query.tab ?? "ALL");
      const status = String(query.status ?? "ALL");
      const search = String(query.search ?? "").toLowerCase();
      const filtered = entries
        .filter((entry) => !entry.deleted)
        .filter(
          (entry) =>
            tab === "ALL" ||
            (tab === "REVENUE" && entry.entryType === "REVENUE") ||
            (tab === "EXPENSE" && entry.entryType === "EXPENSE") ||
            (tab === "TRANSFER" &&
              String(entry.entryType).startsWith("TRANSFER_")) ||
            (tab === "OWNER" && String(entry.entryType).startsWith("OWNER_")) ||
            (tab === "CANCELED" && entry.persistedStatus === "CANCELED"),
        )
        .filter((entry) => status === "ALL" || entry.displayStatus === status)
        .filter(
          (entry) =>
            !search || String(entry.description).toLowerCase().includes(search),
        );
      return { items: filtered, total: filtered.length };
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
      if (command === "finance_options") return options;
      if (command === "list_financial_entries") return list(args);
      if (command === "save_financial_entry") {
        const input = args.input as Value;
        if (input.id) {
          const existing = entries.find((entry) => entry.id === input.id);
          if (existing)
            Object.assign(existing, input, {
              categoryName:
                input.categoryId === "revenue" ? "Serviços" : "Fornecedores",
            });
          return {
            entryIds: [input.id],
            groupId: existing?.entryGroupId ?? null,
            recurrenceId: existing?.recurrenceId ?? null,
          };
        }
        const count = Number(input.installmentCount ?? 1);
        const total = Number(input.grossAmountCents);
        const base = Math.floor(total / count);
        const remainder = total % count;
        const groupId = count > 1 ? id() : null;
        const created: Value[] = [];
        for (let index = 0; index < count; index++) {
          const entry = summary(
            input,
            base + (index === count - 1 ? remainder : 0),
            count > 1
              ? (input.installmentDueDates as string[])[index]
              : (input.dueDate as string | null),
            index + 1,
            count,
            groupId,
          );
          entries.push(entry);
          created.push(entry);
        }
        let recurrenceId: string | null = null;
        if (input.recurrence) {
          recurrenceId = id();
          created[0].recurrenceId = recurrenceId;
          recurrences.push({
            id: recurrenceId,
            description: input.description,
            frequency: (input.recurrence as Value).frequency,
            intervalValue: (input.recurrence as Value).intervalValue,
            startDate: (input.recurrence as Value).startDate,
            endDate: (input.recurrence as Value).endDate,
            nextGenerationDate: "2026-09-04",
            maximumOccurrences: (input.recurrence as Value).maximumOccurrences,
            generatedOccurrences: 1,
            isActive: true,
          });
        }
        return {
          entryIds: created.map((entry) => entry.id),
          groupId,
          recurrenceId,
        };
      }
      if (command === "get_financial_entry")
        return entries.find((entry) => entry.id === args.id);
      if (command === "settle_financial_entry") {
        const input = args.input as Value;
        const entry = entries.find((value) => value.id === input.entryId)!;
        const amount = Number(input.amountCents);
        entry.settledPrincipalCents =
          Number(entry.settledPrincipalCents) + amount;
        entry.remainingAmountCents = Math.max(
          0,
          Number(entry.grossAmountCents) - Number(entry.settledPrincipalCents),
        );
        entry.persistedStatus =
          entry.remainingAmountCents === 0 ? "SETTLED" : "PENDING";
        entry.displayStatus =
          entry.remainingAmountCents === 0 ? "SETTLED" : "PARTIAL";
        (entry.settlements as Value[]).push({
          id: id(),
          settlementDate: input.settlementDate,
          financialAccountId: input.financialAccountId,
          financialAccountName: "Caixa",
          paymentMethodId: input.paymentMethodId,
          paymentMethodName: "Pix",
          principalAmountCents: amount,
          discountAmountCents: 0,
          feeAmountCents: 0,
          interestAmountCents: 0,
          penaltyAmountCents: 0,
          netAmountCents: amount,
          notes: null,
          createdAt: new Date().toISOString(),
        });
        return {
          entryId: entry.id,
          settlementId: id(),
          status: entry.persistedStatus,
          remainingAmountCents: entry.remainingAmountCents,
        };
      }
      if (command === "create_financial_transfer") {
        const input = args.input as Value;
        const groupId = id();
        const out = summary(
          {
            ...input,
            entryType: "TRANSFER_OUT",
            issueDate: input.date,
            competenceDate: input.date,
            dueDate: input.date,
            status: "SETTLED",
            categoryId: null,
            contactId: null,
            financialAccountId: input.sourceAccountId,
            paymentMethodId: input.paymentMethodId,
          },
          Number(input.amountCents),
          String(input.date),
          1,
          1,
          groupId,
        );
        const inside = summary(
          {
            ...input,
            entryType: "TRANSFER_IN",
            issueDate: input.date,
            competenceDate: input.date,
            dueDate: input.date,
            status: "SETTLED",
            categoryId: null,
            contactId: null,
            financialAccountId: input.destinationAccountId,
            paymentMethodId: input.paymentMethodId,
          },
          Number(input.amountCents),
          String(input.date),
          1,
          1,
          groupId,
        );
        entries.push(out, inside);
        return { entryIds: [out.id, inside.id], groupId, recurrenceId: null };
      }
      if (command === "cancel_financial_entry") {
        const entry = entries.find((value) => value.id === args.id)!;
        entry.persistedStatus = "CANCELED";
        entry.displayStatus = "CANCELED";
        entry.remainingAmountCents = 0;
        return null;
      }
      if (command === "reschedule_financial_entry") {
        const entry = entries.find((value) => value.id === args.id)!;
        entry.dueDate = args.dueDate;
        return null;
      }
      if (command === "reverse_financial_entry") {
        const entry = entries.find((value) => value.id === args.id)!;
        entry.reversedAt = new Date().toISOString();
        entry.displayStatus = "REVERSED";
        return { entryIds: [id()], groupId: id(), recurrenceId: null };
      }
      if (command === "list_recurrences") return recurrences;
      if (command === "set_recurrence_active") {
        const item = recurrences.find((value) => value.id === args.id)!;
        item.isActive = args.active;
        return null;
      }
      if (command === "list_obligations") {
        const query = args.query as Value;
        const type = query.kind === "RECEIVABLE" ? "REVENUE" : "EXPENSE";
        const pending = entries.filter(
          (entry) =>
            entry.entryType === type && entry.persistedStatus === "PENDING",
        );
        const totalPendingCents = pending.reduce(
          (sum, entry) => sum + Number(entry.remainingAmountCents),
          0,
        );
        return {
          items: pending,
          total: pending.length,
          indicators: {
            totalPendingCents,
            overdueCents: 0,
            dueTodayCents: totalPendingCents,
            nextSevenDaysCents: 0,
            settledThisMonthCents: entries
              .filter((entry) => entry.entryType === type)
              .reduce(
                (sum, entry) => sum + Number(entry.settledPrincipalCents),
                0,
              ),
          },
        };
      }
      if (command === "financial_cash_flow") {
        const settlements = entries.reduce(
          (sum, entry) => sum + Number(entry.settledPrincipalCents),
          0,
        );
        const transfers = entries.filter((entry) =>
          String(entry.entryType).startsWith("TRANSFER_"),
        );
        const transferResult = transfers.reduce(
          (sum, entry) =>
            sum +
            (entry.direction === "IN"
              ? Number(entry.grossAmountCents)
              : -Number(entry.grossAmountCents)),
          0,
        );
        return {
          openingBalanceCents: 150000,
          inflowCents: settlements + Math.max(0, transferResult),
          outflowCents: Math.max(0, -transferResult),
          resultCents:
            entries
              .filter((entry) => entry.entryType === "REVENUE")
              .reduce(
                (sum, entry) => sum + Number(entry.settledPrincipalCents),
                0,
              ) -
            entries
              .filter((entry) => entry.entryType === "EXPENSE")
              .reduce(
                (sum, entry) => sum + Number(entry.settledPrincipalCents),
                0,
              ),
          closingBalanceCents: 150000 + settlements + transferResult,
          projectedBalanceCents: 150000 + settlements + transferResult,
          projectedInflowCents: 0,
          projectedOutflowCents: 0,
          regime: (args.query as Value).regime,
          days: [
            {
              date: "2026-08-04",
              openingBalanceCents: 150000,
              inflowCents: settlements,
              outflowCents: 0,
              dailyResultCents: settlements,
              closingBalanceCents: 150000 + settlements,
            },
          ],
        };
      }
      throw new Error(`Comando não simulado: ${command}`);
    };
    (
      window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invoke } }
    ).__TAURI_INTERNALS__ = { invoke };
  });
}

test("registra receita, faz baixa parcial e atualiza contas a receber", async ({
  page,
}) => {
  await installFinanceMock(page);
  await page.goto("/movimentacoes");
  await page.getByRole("button", { name: "Nova movimentação" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Descrição *").fill("Mensalidade de agosto");
  await form.getByLabel("Valor total (R$) *").fill("100,00");
  await form.getByLabel("Categoria *").selectOption("revenue");
  await form.getByLabel("Contato").selectOption("contact");
  await form.getByRole("button", { name: "Salvar movimentação" }).click();
  await expect(page.getByText("Mensalidade de agosto")).toBeVisible();
  await page.getByRole("button", { name: "Liquidar" }).click();
  const settlement = page.getByRole("dialog");
  await settlement
    .getByLabel("Valor efetivamente liquidado (R$) *")
    .fill("40,00");
  await settlement
    .getByRole("button", { name: "Confirmar liquidação" })
    .click();
  await expect(
    page.getByRole("table").getByText("Parcial", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Contas a receber" }).click();
  await expect(
    page.getByRole("heading", { name: "Contas a receber" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "R$ 60,00" })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("gera parcelas com vencimentos editáveis e diferença na última", async ({
  page,
}) => {
  await installFinanceMock(page);
  await page.goto("/movimentacoes");
  await page.getByRole("button", { name: "Nova movimentação" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Tipo *").selectOption("EXPENSE");
  await form.getByLabel("Descrição *").fill("Compra parcelada");
  await form.getByLabel("Valor total (R$) *").fill("100,00");
  await form.getByLabel("Categoria *").selectOption("expense");
  await form.getByLabel("Quantidade de parcelas").fill("3");
  await expect(form.getByLabel("Parcela 3/3")).toBeVisible();
  await form.getByRole("button", { name: "Gerar 3 parcelas" }).click();
  await expect(page.getByText("3 movimentação(ões)")).toBeVisible();
  await expect(page.getByText("R$ 33,34")).toBeVisible();
});

test("cria recorrência gerenciável", async ({ page }) => {
  await installFinanceMock(page);
  await page.goto("/movimentacoes");
  await page.getByRole("button", { name: "Nova movimentação" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Descrição *").fill("Contrato mensal");
  await form.getByLabel("Valor total (R$) *").fill("250,00");
  await form.getByLabel("Categoria *").selectOption("revenue");
  await form.getByLabel("Repetir automaticamente").check();
  await form.getByLabel("Máximo de ocorrências").fill("3");
  await form.getByRole("button", { name: "Salvar movimentação" }).click();
  await page.getByRole("button", { name: "Recorrências" }).click();
  await expect(
    page.getByRole("dialog").getByText("Contrato mensal"),
  ).toBeVisible();
  await expect(page.getByRole("dialog").getByText("1/3")).toBeVisible();
});

test("transferência aparece em duas pontas e fluxo mantém resultado neutro", async ({
  page,
}) => {
  await installFinanceMock(page);
  await page.goto("/movimentacoes");
  await page.getByRole("button", { name: "Transferir" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Valor (R$) *").fill("200,00");
  await form.getByLabel("Conta de origem *").selectOption("account-a");
  await form.getByLabel("Conta de destino *").selectOption("account-b");
  await form.getByRole("button", { name: "Confirmar transferência" }).click();
  await page.getByRole("button", { name: "Transferências" }).click();
  await expect(page.getByText("2 movimentação(ões)")).toBeVisible();
  await page.getByRole("link", { name: "Fluxo de caixa" }).click();
  const resultCard = page
    .locator("article")
    .filter({ hasText: "Resultado (caixa)" });
  await expect(resultCard).toContainText("R$ 0,00");
});

test("cancela pendência e estorna lançamento liquidado pela interface", async ({
  page,
}) => {
  await installFinanceMock(page);
  await page.goto("/movimentacoes");

  await page.getByRole("button", { name: "Nova movimentação" }).click();
  let form = page.getByRole("dialog");
  await form.getByLabel("Tipo *").selectOption("EXPENSE");
  await form.getByLabel("Descrição *").fill("Despesa cancelável");
  await form.getByLabel("Valor total (R$) *").fill("80,00");
  await form.getByLabel("Categoria *").selectOption("expense");
  await form.getByRole("button", { name: "Salvar movimentação" }).click();
  await page.getByRole("button", { name: "Cancelar" }).click();
  let reason = page.getByRole("dialog");
  await reason.getByLabel("Motivo *").fill("Compra não realizada");
  await reason.getByRole("button", { name: "Confirmar" }).click();
  await expect(
    page.getByRole("table").getByText("Cancelado", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Nova movimentação" }).click();
  form = page.getByRole("dialog");
  await form.getByLabel("Descrição *").fill("Receita a estornar");
  await form.getByLabel("Valor total (R$) *").fill("120,00");
  await form.getByLabel("Categoria *").selectOption("revenue");
  await form.getByLabel("Situação *").selectOption("SETTLED");
  await form.getByRole("button", { name: "Salvar movimentação" }).click();
  await page.getByRole("button", { name: "Estornar", exact: true }).click();
  reason = page.getByRole("dialog");
  await reason.getByLabel("Motivo *").fill("Recebimento devolvido");
  await reason.getByRole("button", { name: "Confirmar" }).click();
  await expect(
    page.getByRole("table").getByText("Estornado", { exact: true }),
  ).toBeVisible();
});
