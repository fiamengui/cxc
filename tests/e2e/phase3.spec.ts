import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousAccessibilityViolations } from "./accessibility";

async function installTauriMock(page: Page) {
  await page.addInitScript(() => {
    type RecordValue = Record<string, unknown>;
    const contacts: RecordValue[] = [];
    const catalog: RecordValue[] = [];
    const references: Record<string, RecordValue[]> = { categories: [], accounts: [], paymentMethods: [] };
    let sequence = 0;
    const identifier = () => `test-${++sequence}`;
    const invoke = async (command: string, args: RecordValue = {}) => {
      if (command === "onboarding_status") return { isCompleted: true, licenseStatus: "ACTIVE" };
      if (command === "phase2_status") return { licenseStatus: "ACTIVE", licenseEdition: "ESSENTIAL", licenseCustomer: "Teste", authorizedMajorVersion: 1, installationId: "test", demoDataLoaded: false, trialExpired: false, trialEndsAt: null, trialEntryLimit: null, trialUsageCount: 0, trialRemainingEntries: null };
      if (command === "list_contacts") {
        const query = args.query as RecordValue;
        const search = String(query.search ?? "").toLowerCase();
        const filter = String(query.filter ?? "ALL");
        const status = String(query.status ?? "ALL");
        const filtered = contacts.filter((item) => !item.deleted)
          .filter((item) => !search || [item.name, item.documentNumber, item.phone].some((value) => String(value ?? "").toLowerCase().includes(search)))
          .filter((item) => filter === "ALL" || (filter === "CUSTOMER" && item.roleCustomer) || (filter === "SUPPLIER" && item.roleSupplier) || (filter === "BOTH" && item.roleCustomer && item.roleSupplier))
          .filter((item) => status === "ALL" || (status === "ACTIVE" && item.isActive) || (status === "INACTIVE" && !item.isActive));
        const offset = Number(query.offset ?? 0); const limit = Number(query.limit ?? 25);
        return { items: filtered.slice(offset, offset + limit), total: filtered.length };
      }
      if (command === "contact_duplicates") return [];
      if (command === "save_contact") {
        const input = args.input as RecordValue; const id = (input.id as string | null) ?? identifier(); const existing = contacts.find((item) => item.id === id);
        const value = { ...input, id, isActive: true, isDemo: false, totalMovedCents: 0, receivableCents: 0, payableCents: 0, lastMovementAt: null, history: [{ action: existing ? "UPDATE" : "CREATE", summary: existing ? "Contato atualizado" : "Contato criado", createdAt: new Date().toISOString() }] };
        if (existing) Object.assign(existing, value); else contacts.push(value); return id;
      }
      if (command === "get_contact") return contacts.find((item) => item.id === args.id);
      if (command === "list_catalog") {
        const query = args.query as RecordValue;
        const search = String(query.search ?? "").toLowerCase(); const filter = String(query.filter ?? "ALL"); const status = String(query.status ?? "ALL");
        const filtered = catalog.filter((item) => !item.deleted)
          .filter((item) => !search || [item.name, item.code, item.category].some((value) => String(value ?? "").toLowerCase().includes(search)))
          .filter((item) => filter === "ALL" || item.itemType === filter)
          .filter((item) => status === "ALL" || (status === "ACTIVE" && item.isActive) || (status === "INACTIVE" && !item.isActive));
        return { items: filtered, total: filtered.length };
      }
      if (command === "save_catalog_item") { const input = args.input as RecordValue; const id = (input.id as string | null) ?? identifier(); const existing = catalog.find((item) => item.id === id); const value = { ...input, id, isActive: true, isDemo: false }; if (existing) Object.assign(existing, value); else catalog.push(value); return id; }
      if (command === "list_reference_data") return references[String(args.resource)];
      if (["save_category", "save_account", "save_payment_method"].includes(command)) { const input = args.input as RecordValue; const resource = command === "save_category" ? "categories" : command === "save_account" ? "accounts" : "paymentMethods"; const id = (input.id as string | null) ?? identifier(); const value = command === "save_category" ? { id, name: input.name, detail: input.nature, isActive: true, isSystem: false, parentId: input.parentId, institution: null, amountCents: null, date: null, colorReference: input.colorReference, isDefault: false, feeBasisPoints: null, receiptDelayDays: null } : command === "save_account" ? { id, name: input.name, detail: input.accountType, isActive: true, isSystem: false, parentId: null, institution: input.institution, amountCents: input.openingBalanceCents, date: input.openingBalanceDate, colorReference: input.colorReference, isDefault: input.isDefault, feeBasisPoints: null, receiptDelayDays: null } : { id, name: input.name, detail: input.paymentType, isActive: true, isSystem: false, parentId: null, institution: null, amountCents: null, date: null, colorReference: null, isDefault: false, feeBasisPoints: input.defaultFeeBasisPoints, receiptDelayDays: input.defaultReceiptDelayDays }; references[resource].push(value); return id; }
      if (command === "set_master_active") { const values = args.resource === "contacts" ? contacts : args.resource === "catalog" ? catalog : references[String(args.resource)]; const item = values.find((value) => value.id === args.id); if (item) item.isActive = args.active; return null; }
      if (command === "delete_master") { const values = args.resource === "contacts" ? contacts : args.resource === "catalog" ? catalog : references[String(args.resource)]; const item = values.find((value) => value.id === args.id); if (item) item.deleted = true; return null; }
      if (command === "plugin:dialog|open") return "C:\\teste\\contatos.csv";
      if (command === "read_contact_csv") return { headers: ["nome", "tipo", "cliente", "fornecedor", "documento"], sampleRows: [["Maria Importada", "PF", "sim", "não", "123"]], totalRows: 1 };
      if (command === "preview_contact_import") return { rows: [{ line: 2, name: "Maria Importada", documentNumber: "123", errors: [], possibleDuplicates: [] }], totalRows: 1, validRows: 1, errorRows: 0, duplicateRows: 0 };
      if (command === "import_contacts") return { imported: 1 };
      throw new Error(`Comando não simulado: ${command}`);
    };
    (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invoke } }).__TAURI_INTERNALS__ = { invoke };
  });
}

test("cadastra contato e exibe detalhe auditado", async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/contatos");
  await expect(page.getByRole("heading", { name: "Clientes e fornecedores" })).toBeVisible();
  await expect(page.getByText("Nenhum contato encontrado")).toBeVisible();
  await page.getByRole("button", { name: "Novo contato" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome *").fill("Mariana Souza");
  await dialog.getByLabel("Fornecedor").check();
  await dialog.getByLabel("Telefone").fill("11999999999");
  await dialog.getByLabel("Cidade").fill("São Paulo");
  await dialog.getByLabel("TagsSepare por vírgulas.").fill("vip, indicação");
  await dialog.getByRole("button", { name: "Salvar contato" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Mariana Souza" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Histórico" }).click();
  await expect(page.getByRole("dialog").getByText("Contato criado")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Fechar" }).click();

  await page.getByPlaceholder("Nome, documento ou telefone").fill("não existe");
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await expect(page.getByText("Nenhum contato encontrado")).toBeVisible();
  await page.getByPlaceholder("Nome, documento ou telefone").fill("119999");
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await expect(page.getByText("Mariana Souza")).toBeVisible();

  page.once("dialog", (confirmation) => confirmation.accept());
  await page.getByRole("button", { name: "Inativar" }).click();
  await expect(page.getByRole("status")).toContainText("Contato inativado");
  await page.getByLabel("Situação do contato").selectOption("INACTIVE");
  await expect(page.getByText("Mariana Souza")).toBeVisible();
  await expect(page.getByText("Inativo", { exact: true })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("mapeia, valida e confirma a importação de contatos por CSV", async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/contatos");
  await page.getByRole("button", { name: "Importar" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Selecionar CSV" }).click();
  await expect(dialog.getByText("1 linha(s), 5 coluna(s)")).toBeVisible();
  await dialog.getByRole("button", { name: "Validar importação" }).click();
  await expect(dialog.getByText("Maria Importada")).toBeVisible();
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Confirmar importação" }).click();
  await expect(page.getByRole("status")).toContainText("1 contato(s) importado(s)");
});

test("cadastra produto com preço e categoria", async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Novo item" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome *").fill("Troca de óleo");
  await dialog.getByLabel("Tipo *").selectOption("SERVICE");
  await dialog.getByLabel("Código").fill("SRV-01");
  await dialog.getByLabel("Categoria").fill("Manutenção");
  await dialog.getByLabel("Valor de venda (R$) *").fill("150,00");
  await dialog.getByRole("button", { name: "Salvar item" }).click();
  await expect(page.getByText("Troca de óleo")).toBeVisible();
  await expect(page.getByText("R$ 150,00")).toBeVisible();
});

test("cadastra categoria, conta e forma de pagamento", async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/cadastros");
  await page.getByRole("button", { name: "Novo cadastro" }).click();
  await page.getByRole("dialog").getByLabel("Nome *").fill("Consultoria");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Consultoria")).toBeVisible();

  await page.getByRole("button", { name: "Contas financeiras" }).click();
  await page.getByRole("button", { name: "Novo cadastro" }).click();
  await page.getByRole("dialog").getByLabel("Nome *").fill("Banco Principal");
  await page.getByRole("dialog").getByLabel("Saldo inicial (R$) *").fill("500,00");
  await page.getByRole("dialog").getByLabel("Usar como conta padrão").check();
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Banco Principal")).toBeVisible();

  await page.getByRole("button", { name: "Formas de pagamento" }).click();
  await page.getByRole("button", { name: "Novo cadastro" }).click();
  await page.getByRole("dialog").getByLabel("Nome *").fill("Link de pagamento");
  await page.getByRole("dialog").getByLabel("Tipo *").selectOption("CREDIT");
  await page.getByRole("dialog").getByLabel("Taxa padrão (%)").fill("2,99");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Link de pagamento")).toBeVisible();
});
