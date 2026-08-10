import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousAccessibilityViolations } from "./accessibility";

async function installSalesMock(page: Page) {
  await page.addInitScript(() => {
    type Value = Record<string, unknown>;
    const sales: Value[] = [];
    let sequence = 0;
    const newId = (prefix: string) => `${prefix}-${++sequence}`;
    const options = {
      customers: [
        {
          id: "customer",
          name: "Maria Cliente",
          detail: "CUSTOMER",
          amountCents: null,
          feeBasisPoints: null,
          receiptDelayDays: null,
        },
      ],
      catalogItems: [
        {
          id: "product",
          name: "Produto Premium",
          detail: "UN",
          amountCents: 10000,
          feeBasisPoints: null,
          receiptDelayDays: null,
        },
      ],
      categories: [
        {
          id: "revenue",
          name: "Vendas",
          detail: "REVENUE",
          amountCents: null,
          feeBasisPoints: null,
          receiptDelayDays: null,
        },
      ],
      accounts: [
        {
          id: "account",
          name: "Caixa",
          detail: "CASH",
          amountCents: 100000,
          feeBasisPoints: null,
          receiptDelayDays: null,
        },
      ],
      paymentMethods: [
        {
          id: "pix",
          name: "Pix",
          detail: "PIX",
          amountCents: null,
          feeBasisPoints: 0,
          receiptDelayDays: 0,
        },
      ],
      defaultFinancialAccountId: "account",
      defaultPaymentMethodId: "pix",
    };
    const financeOptions = {
      businessName: "Loja Teste",
      defaultFinancialAccountId: "account",
      defaultPaymentMethodId: "pix",
      defaultViewRegime: "CASH",
      contacts: [
        {
          id: "customer",
          name: "Maria Cliente",
          detail: "CUSTOMER",
          currentBalanceCents: null,
        },
      ],
      categories: [
        {
          id: "revenue",
          name: "Vendas",
          detail: "REVENUE",
          currentBalanceCents: null,
        },
      ],
      accounts: [
        {
          id: "account",
          name: "Caixa",
          detail: "CASH",
          currentBalanceCents: 100000,
        },
      ],
      paymentMethods: [
        {
          id: "pix",
          name: "Pix",
          detail: "PIX",
          currentBalanceCents: null,
        },
      ],
    };

    const entriesOf = (sale: Value) => sale.receivables as Value[];
    const syncSale = (sale: Value) => {
      const active = entriesOf(sale).filter(
        (entry) => !entry.reversedAt && entry.persistedStatus !== "CANCELED",
      );
      const received = active.reduce(
        (sum, entry) => sum + Number(entry.settledPrincipalCents),
        0,
      );
      const remaining = active
        .filter((entry) => entry.persistedStatus === "PENDING")
        .reduce((sum, entry) => sum + Number(entry.remainingAmountCents), 0);
      sale.receivedAmountCents = received;
      sale.remainingAmountCents = remaining;
      if (sale.status !== "CANCELED") {
        sale.status =
          active.length > 0 && remaining === 0
            ? "RECEIVED"
            : received > 0
              ? "PARTIALLY_RECEIVED"
              : "CONFIRMED";
      }
    };
    const makeEntry = (
      sale: Value,
      amount: number,
      installmentNumber: number,
      installmentCount: number,
      settled: boolean,
      dueDate: string,
    ): Value => ({
      id: newId("entry"),
      entryGroupId: sale.financialGroupId,
      entryType: "REVENUE",
      direction: "IN",
      originType: "SALE",
      originId: sale.id,
      contactId: "customer",
      contactName: "Maria Cliente",
      categoryId: "revenue",
      categoryName: "Vendas",
      financialAccountId: settled ? "account" : null,
      financialAccountName: settled ? "Caixa" : null,
      paymentMethodId: "pix",
      paymentMethodName: "Pix",
      description: `Venda ${String(sale.number)}`,
      documentReference: sale.number,
      issueDate: sale.issueDate,
      competenceDate: sale.issueDate,
      dueDate,
      settlementDate: settled ? sale.issueDate : null,
      grossAmountCents: amount,
      netAmountCents: amount,
      installmentNumber,
      installmentCount,
      persistedStatus: settled ? "SETTLED" : "PENDING",
      displayStatus: settled ? "SETTLED" : "PENDING",
      isRecurring: false,
      recurrenceId: null,
      notes: sale.notes,
      cancelReason: null,
      reversedAt: null,
      reversalReason: null,
      settledPrincipalCents: settled ? amount : 0,
      remainingAmountCents: settled ? 0 : amount,
      settlements: settled
        ? [
            {
              id: newId("settlement"),
              settlementDate: sale.issueDate,
              financialAccountId: "account",
              financialAccountName: "Caixa",
              paymentMethodId: "pix",
              paymentMethodName: "Pix",
              principalAmountCents: amount,
              discountAmountCents: 0,
              feeAmountCents: 0,
              interestAmountCents: 0,
              penaltyAmountCents: 0,
              netAmountCents: amount,
              notes: null,
              createdAt: new Date().toISOString(),
            },
          ]
        : [],
      history: [],
    });
    const createReceivables = (sale: Value, input: Value) => {
      const net = Number(sale.netAmountCents);
      const mode = String(input.receiptMode);
      const immediate = Number(input.receivedNowCents);
      const pending = net - immediate;
      const pendingCount =
        mode === "IMMEDIATE"
          ? 0
          : mode === "FUTURE"
            ? 1
            : Number(input.installmentCount);
      const totalCount = pendingCount + (immediate > 0 ? 1 : 0);
      const entries: Value[] = [];
      let number = 1;
      if (immediate > 0) {
        entries.push(
          makeEntry(
            sale,
            immediate,
            number++,
            totalCount,
            true,
            String(input.issueDate),
          ),
        );
      }
      if (pendingCount > 0) {
        const base = Math.floor(pending / pendingCount);
        const remainder = pending % pendingCount;
        for (let index = 0; index < pendingCount; index++) {
          entries.push(
            makeEntry(
              sale,
              base + (index === pendingCount - 1 ? remainder : 0),
              number++,
              totalCount,
              false,
              String(input.firstDueDate),
            ),
          );
        }
      }
      sale.receivables = entries;
      syncSale(sale);
    };
    const saveSale = (input: Value) => {
      const originalItems = input.items as Value[];
      const frozenItems = originalItems.map((item) => {
        const gross = Math.round(
          (Number(item.unitPriceCents) * Number(item.quantityMillis)) / 1000,
        );
        return {
          ...item,
          id: newId("item"),
          totalCents: gross - Number(item.discountCents),
        };
      });
      const gross = originalItems.reduce(
        (sum, item) =>
          sum +
          Math.round(
            (Number(item.unitPriceCents) * Number(item.quantityMillis)) / 1000,
          ),
        0,
      );
      const discounts =
        Number(input.discountAmountCents) +
        originalItems.reduce(
          (sum, item) => sum + Number(item.discountCents),
          0,
        );
      let sale = sales.find((item) => item.id === input.id);
      const id = sale?.id ?? newId("sale");
      const number =
        sale?.number ??
        `V${String(input.issueDate).slice(0, 4)}-${String(sales.length + 1).padStart(6, "0")}`;
      if (!sale) {
        sale = {};
        sales.push(sale);
      }
      Object.assign(sale, input, {
        id,
        number,
        customerName: "Maria Cliente",
        categoryName: "Vendas",
        paymentMethodName: "Pix",
        financialAccountName: input.financialAccountId ? "Caixa" : null,
        grossAmountCents: gross,
        discountAmountCents: discounts,
        netAmountCents:
          gross - discounts - Number(input.feeAmountCents),
        financialGroupId:
          input.status === "CONFIRMED" ? newId("sale-group") : null,
        status: input.status,
        items: frozenItems,
        receivables: [],
        history: [
          {
            action: input.status === "CONFIRMED" ? "CONFIRM" : "CREATE",
            summary:
              input.status === "CONFIRMED"
                ? "Venda confirmada e contas a receber geradas"
                : "Venda criada",
            createdAt: new Date().toISOString(),
          },
        ],
        business: {
          name: "Loja Teste",
          documentNumber: "12.345.678/0001-90",
          phone: "(11) 99999-9999",
          email: "contato@lojateste.com.br",
          address: "Rua Central, 100",
          city: "São Paulo",
          state: "SP",
          logoPath: null,
        },
        cancelReason: null,
        canceledAt: null,
        confirmedAt:
          input.status === "CONFIRMED" ? new Date().toISOString() : null,
        receivedAmountCents: 0,
        remainingAmountCents: 0,
      });
      if (input.status === "CONFIRMED") createReceivables(sale, input);
      return {
        id,
        number,
        status: sale.status,
        financialEntryIds: entriesOf(sale).map((entry) => entry.id),
        idempotentReplay: false,
      };
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
      if (command === "sales_options") return options;
      if (command === "finance_options") return financeOptions;
      if (command === "list_sales") {
        const query = args.query as Value;
        const filtered = sales.filter(
          (sale) =>
            (query.status === "ALL" || sale.status === query.status) &&
            (!query.search ||
              String(sale.number)
                .toLowerCase()
                .includes(String(query.search).toLowerCase())),
        );
        return { items: filtered, total: filtered.length };
      }
      if (command === "save_sale") return saveSale(args.input as Value);
      if (command === "get_sale")
        return sales.find((sale) => sale.id === args.id);
      if (command === "settle_financial_entry") {
        const input = args.input as Value;
        const sale = sales.find((candidate) =>
          entriesOf(candidate).some((entry) => entry.id === input.entryId),
        )!;
        const entry = entriesOf(sale).find(
          (candidate) => candidate.id === input.entryId,
        )!;
        const amount = Number(input.amountCents);
        entry.settledPrincipalCents =
          Number(entry.settledPrincipalCents) + amount;
        entry.remainingAmountCents = Math.max(
          0,
          Number(entry.grossAmountCents) -
            Number(entry.settledPrincipalCents),
        );
        entry.persistedStatus =
          entry.remainingAmountCents === 0 ? "SETTLED" : "PENDING";
        entry.displayStatus =
          entry.remainingAmountCents === 0 ? "SETTLED" : "PARTIAL";
        entry.financialAccountId = input.financialAccountId;
        entry.financialAccountName = "Caixa";
        syncSale(sale);
        return {
          settlementId: newId("settlement"),
          entryStatus: entry.persistedStatus,
          remainingAmountCents: entry.remainingAmountCents,
        };
      }
      if (command === "reverse_financial_entry") {
        const sale = sales.find((candidate) =>
          entriesOf(candidate).some((entry) => entry.id === args.id),
        )!;
        const entry = entriesOf(sale).find(
          (candidate) => candidate.id === args.id,
        )!;
        entry.reversedAt = new Date().toISOString();
        entry.reversalReason = args.reason;
        entry.displayStatus = "REVERSED";
        syncSale(sale);
        return {
          entryIds: [newId("reversal")],
          groupId: newId("reversal-group"),
          recurrenceId: null,
        };
      }
      if (command === "cancel_sale") {
        const sale = sales.find((candidate) => candidate.id === args.id)!;
        const activeReceipt = entriesOf(sale).some(
          (entry) => Number(entry.settledPrincipalCents) > 0 && !entry.reversedAt,
        );
        if (activeReceipt)
          throw new Error(
            "Estorne todos os recebimentos antes de cancelar a venda.",
          );
        sale.status = "CANCELED";
        sale.cancelReason = args.reason;
        sale.canceledAt = new Date().toISOString();
        entriesOf(sale).forEach((entry) => {
          if (!entry.reversedAt) {
            entry.persistedStatus = "CANCELED";
            entry.displayStatus = "CANCELED";
            entry.remainingAmountCents = 0;
          }
        });
        return null;
      }
      if (command === "plugin:dialog|save")
        return "C:\\Temp\\Comprovante-venda.pdf";
      if (command === "export_sale_receipt_pdf") return null;
      throw new Error(`Comando não simulado: ${command}`);
    };
    (
      window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invoke } }
    ).__TAURI_INTERNALS__ = { invoke };
  });
}

test("confirma venda parcelada, congela itens e gera comprovante não fiscal", async ({
  page,
}) => {
  await installSalesMock(page);
  await page.goto("/vendas");
  await page.getByRole("button", { name: "Nova venda" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Cliente *").selectOption("customer");
  await form.getByLabel("Descrição *").first().fill("Venda parcelada premium");
  await form.getByLabel("Catálogo").selectOption("product");
  await form.getByLabel("Quantidade *").fill("2,5");
  await form.getByLabel("Desconto", { exact: true }).fill("5,00");
  await form.getByLabel("Desconto adicional (R$)").fill("10,00");
  await form.getByLabel("Taxa da venda (R$)").fill("2,00");
  await form.getByLabel("Condição *").selectOption("INSTALLMENTS");
  await form.getByLabel("Quantidade de parcelas *").fill("3");
  await form.getByRole("button", { name: "Confirmar venda" }).click();

  await expect(page.getByText("Venda V", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "R$ 233,00" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByText("Confirmada", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^V\d{4}-000001$/ }).click();
  const detail = page.getByRole("dialog");
  await detail.getByRole("button", { name: "Itens" }).click();
  await expect(detail.getByText("Item do catálogo congelado")).toBeVisible();
  await detail.getByRole("button", { name: "Recebimentos" }).click();
  await expect(detail.getByText("Parcela", { exact: false })).toHaveCount(3);
  await expect(
    detail.getByText("Parcela 3/3", { exact: false }),
  ).toContainText("R$ 77,68");
  await detail.getByRole("button", { name: "Comprovante" }).first().click();
  await expect(
    detail.getByText("Documento sem valor fiscal", { exact: false }).first(),
  ).toBeVisible();
  await expect(detail.getByText("Loja Teste", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Exportar PDF" }).click();
  await expect(detail.getByText("PDF salvo em", { exact: false })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("recebe venda mista e exige estorno antes do cancelamento", async ({
  page,
}) => {
  await installSalesMock(page);
  await page.goto("/vendas");
  await page.getByRole("button", { name: "Nova venda" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Cliente *").selectOption("customer");
  await form.getByLabel("Descrição *").first().fill("Venda com sinal");
  await form.getByLabel("Catálogo").selectOption("product");
  await form.getByLabel("Condição *").selectOption("MIXED");
  await form.getByLabel("Valor recebido agora (R$) *").fill("40,00");
  await form.getByRole("button", { name: "Confirmar venda" }).click();
  await expect(
    page
      .getByRole("table")
      .getByText("Parcialmente recebida", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^V\d{4}-000001$/ }).click();
  let detail = page.getByRole("dialog");
  await detail.getByRole("button", { name: "Recebimentos" }).click();
  await detail.getByRole("button", { name: "Receber" }).click();
  const settlement = page.getByRole("dialog").last();
  await settlement
    .getByLabel("Valor efetivamente liquidado (R$) *")
    .fill("60,00");
  await settlement
    .getByRole("button", { name: "Confirmar liquidação" })
    .click();
  await expect(detail.getByText("Recebimento registrado.")).toBeVisible();

  await detail.getByRole("button", { name: "Cancelar" }).click();
  let reason = page.getByRole("dialog").last();
  await reason.getByLabel("Motivo *").fill("Cliente solicitou cancelamento");
  await reason.getByRole("button", { name: "Confirmar" }).click();
  await expect(
    reason.getByText("Estorne todos os recebimentos antes", { exact: false }),
  ).toBeVisible();
  await reason.getByRole("button", { name: "Fechar" }).click();

  await page.getByRole("button", { name: /^V\d{4}-000001$/ }).click();
  detail = page.getByRole("dialog");
  await detail.getByRole("button", { name: "Recebimentos" }).click();
  const reverseNext = async () => {
    await detail.getByRole("button", { name: "Estornar" }).first().click();
    const reverse = page.getByRole("dialog").last();
    await reverse.getByLabel("Motivo *").fill("Valor devolvido ao cliente");
    await reverse.getByRole("button", { name: "Confirmar" }).click();
    await expect(detail.getByText("Recebimento estornado", { exact: false })).toBeVisible();
  };
  await reverseNext();
  await reverseNext();
  await detail.getByRole("button", { name: "Cancelar" }).click();
  reason = page.getByRole("dialog").last();
  await reason.getByLabel("Motivo *").fill("Cliente solicitou cancelamento");
  await reason.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Venda cancelada", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("table").getByText("Cancelada", { exact: true }),
  ).toBeVisible();
});
