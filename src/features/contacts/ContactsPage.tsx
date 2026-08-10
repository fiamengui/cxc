import { useCallback, useEffect, useState } from "react";
import {
  Download,
  Eye,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import {
  chooseContactCsv,
  chooseCsvDestination,
  createContactCsvTemplate,
  deleteMaster,
  exportContacts,
  findContactDuplicates,
  getContact,
  importContacts,
  listContacts,
  previewContactImport,
  readContactCsv,
  saveContact,
  setMasterActive,
  type ContactCsvMapping,
  type ContactDetail,
  type ContactFinancialEntry,
  type ContactImportPreview,
  type ContactInput,
  type ContactSale,
  type ContactSummary,
  type CsvFilePreview,
  type ListQuery,
} from "../../infrastructure/masters";
import { money } from "../../domain/display";
import { EmptyState, Feedback, Field, Modal } from "../masters/components";

const initialContact: ContactInput = {
  id: null,
  name: "",
  contactKind: "PERSON",
  roleCustomer: true,
  roleSupplier: false,
  tradeName: null,
  documentNumber: null,
  phone: null,
  whatsapp: null,
  email: null,
  address: null,
  city: null,
  state: null,
  postalCode: null,
  notes: null,
  tags: [],
};
const pageSize = 25;

export function ContactsPage() {
  const [items, setItems] = useState<ContactSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [status, setStatus] = useState("ACTIVE");
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<ContactInput | null>(null);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const query: ListQuery = {
    search,
    filter,
    status,
    limit: pageSize,
    offset: page * pageSize,
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listContacts({
        search,
        filter,
        status,
        limit: pageSize,
        offset: page * pageSize,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }, [search, filter, status, page]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const contactId = new URLSearchParams(window.location.search).get(
      "contact",
    );
    if (contactId)
      void getContact(contactId)
        .then(setDetail)
        .catch((reason) => setError(String(reason)));
  }, []);
  const notify = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(null), 4000);
  };
  const openDetail = async (id: string) => {
    setError(null);
    try {
      setDetail(await getContact(id));
    } catch (reason) {
      setError(String(reason));
    }
  };
  const edit = async (id: string) => {
    setError(null);
    try {
      const value = await getContact(id);
      setDetail(null);
      setForm(toInput(value));
    } catch (reason) {
      setError(String(reason));
    }
  };
  const toggle = async (item: ContactSummary) => {
    const deactivating = item.isActive;
    if (
      !window.confirm(`${deactivating ? "Inativar" : "Reativar"} ${item.name}?`)
    )
      return;
    try {
      await setMasterActive("contacts", item.id, !deactivating);
      notify(deactivating ? "Contato inativado." : "Contato reativado.");
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  };
  const remove = async (item: ContactSummary) => {
    if (
      !window.confirm(
        `Excluir ${item.name}? Essa ação remove o contato das listagens.`,
      )
    )
      return;
    try {
      await deleteMaster("contacts", item.id);
      notify("Contato excluído.");
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  };
  const exportCsv = async () => {
    const path = await chooseCsvDestination(
      `Contatos_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    if (!path) return;
    try {
      const count = await exportContacts(path, {
        ...query,
        limit: 100,
        offset: 0,
      });
      notify(`${count} contato(s) exportado(s).`);
    } catch (reason) {
      setError(String(reason));
    }
  };
  const template = async () => {
    const path = await chooseCsvDestination("Modelo_Contatos.csv");
    if (!path) return;
    try {
      await createContactCsvTemplate(path);
      notify("Modelo CSV criado.");
    } catch (reason) {
      setError(String(reason));
    }
  };

  return (
    <section className="mx-auto max-w-7xl py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Clientes e fornecedores
          </h1>
          <p className="mt-1 text-slate-600">
            Cadastre pessoas e empresas sem duplicar informações.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void template()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
          >
            <Download size={16} />
            Modelo CSV
          </button>
          <button
            onClick={() => setImporting(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
          >
            <Upload size={16} />
            Importar
          </button>
          <button
            onClick={() => void exportCsv()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
          >
            <FileSpreadsheet size={16} />
            Exportar
          </button>
          <button
            onClick={() => setForm({ ...initialContact })}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus size={17} />
            Novo contato
          </button>
        </div>
      </header>
      <div className="mt-6 space-y-3">
        <Feedback message={message} error={error} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setPage(0);
            setSearch(searchDraft.trim());
          }}
          className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3"
        >
          <label className="relative min-w-64 flex-1">
            <span className="sr-only">Pesquisar contatos</span>
            <Search
              className="absolute left-3 top-2.5 text-slate-400"
              size={18}
            />
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Nome, documento ou telefone"
              className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3"
            />
          </label>
          <select
            aria-label="Papel do contato"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-slate-300 px-3"
          >
            <option value="ALL">Todos os papéis</option>
            <option value="CUSTOMER">Clientes</option>
            <option value="SUPPLIER">Fornecedores</option>
            <option value="BOTH">Ambos</option>
          </select>
          <select
            aria-label="Situação do contato"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-slate-300 px-3"
          >
            <option value="ALL">Ativos e inativos</option>
            <option value="ACTIVE">Ativos</option>
            <option value="INACTIVE">Inativos</option>
          </select>
          <button className="rounded-lg bg-ink px-4 py-2 font-semibold text-white">
            Pesquisar
          </button>
        </form>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-surface">
        {loading ? (
          <p className="p-6 text-slate-500">Carregando contatos…</p>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nenhum contato encontrado"
              text="Ajuste os filtros ou cadastre o primeiro cliente ou fornecedor."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">Cidade</th>
                  <th className="px-4 py-3 text-right">Total movimentado</th>
                  <th className="px-4 py-3 text-right">Saldo a receber</th>
                  <th className="px-4 py-3 text-right">Saldo a pagar</th>
                  <th className="px-4 py-3">Última movimentação</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => void openDetail(item.id)}
                        className="font-semibold text-brand hover:underline"
                      >
                        {item.name}
                      </button>
                      {item.isDemo && (
                        <span className="ml-2 rounded bg-violet-50 px-2 py-0.5 text-xs text-violet-700">
                          Exemplo
                        </span>
                      )}
                      <p className="text-xs text-slate-500">
                        {roleLabel(item)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {item.contactKind === "PERSON" ? "Pessoa" : "Empresa"}
                    </td>
                    <td className="px-4 py-3">{item.phone ?? "—"}</td>
                    <td className="px-4 py-3">{item.city ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {money.format(item.totalMovedCents / 100)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {money.format(item.receivableCents / 100)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {money.format(item.payableCents / 100)}
                    </td>
                    <td className="px-4 py-3">
                      {item.lastMovementAt
                        ? new Date(item.lastMovementAt).toLocaleDateString(
                            "pt-BR",
                          )
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${item.isActive ? "bg-green-50 text-positive" : "bg-slate-100 text-slate-600"}`}
                      >
                        {item.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Action
                          label="Ver detalhes"
                          onClick={() => void openDetail(item.id)}
                          icon={Eye}
                        />
                        <Action
                          label="Editar"
                          onClick={() => void edit(item.id)}
                          icon={Pencil}
                        />
                        <Action
                          label={item.isActive ? "Inativar" : "Reativar"}
                          onClick={() => void toggle(item)}
                          icon={item.isActive ? UserRoundX : UserRoundCheck}
                        />
                        <Action
                          label="Excluir"
                          onClick={() => void remove(item)}
                          icon={Trash2}
                          critical
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <footer className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>{total} contato(s)</span>
        <div className="flex gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="px-2 py-2">Página {page + 1}</span>
          <button
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage((value) => value + 1)}
            className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </footer>
      {form && (
        <ContactForm
          initial={form}
          onClose={() => setForm(null)}
          onSaved={async (id) => {
            setForm(null);
            notify(form.id ? "Contato atualizado." : "Contato criado.");
            await refresh();
            await openDetail(id);
          }}
        />
      )}
      {detail && (
        <ContactDetailModal
          contact={detail}
          onClose={() => setDetail(null)}
          onEdit={() => void edit(detail.id)}
        />
      )}
      {importing && (
        <ContactImport
          onClose={() => setImporting(false)}
          onImported={async (count) => {
            setImporting(false);
            notify(`${count} contato(s) importado(s).`);
            await refresh();
          }}
        />
      )}
    </section>
  );
}

function roleLabel(contact: { roleCustomer: boolean; roleSupplier: boolean }) {
  return contact.roleCustomer && contact.roleSupplier
    ? "Cliente e fornecedor"
    : contact.roleSupplier
      ? "Fornecedor"
      : "Cliente";
}
function Action({
  label,
  onClick,
  icon: Icon,
  critical = false,
}: {
  label: string;
  onClick: () => void;
  icon: typeof Eye;
  critical?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`rounded-lg p-2 hover:bg-slate-100 ${critical ? "text-critical" : "text-slate-600"}`}
    >
      <Icon size={16} />
    </button>
  );
}
function toInput(detail: ContactDetail): ContactInput {
  return {
    id: detail.id,
    name: detail.name,
    contactKind: detail.contactKind,
    roleCustomer: detail.roleCustomer,
    roleSupplier: detail.roleSupplier,
    tradeName: detail.tradeName,
    documentNumber: detail.documentNumber,
    phone: detail.phone,
    whatsapp: detail.whatsapp,
    email: detail.email,
    address: detail.address,
    city: detail.city,
    state: detail.state,
    postalCode: detail.postalCode,
    notes: detail.notes,
    tags: detail.tags,
  };
}

function ContactForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: ContactInput;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const text =
    (field: keyof ContactInput) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue((current) => ({
        ...current,
        [field]: event.target.value || null,
      }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (value.name.trim().length < 2) {
      setError("Informe o nome do contato.");
      return;
    }
    if (!value.roleCustomer && !value.roleSupplier) {
      setError("Selecione cliente, fornecedor ou ambos.");
      return;
    }
    setBusy(true);
    const input = {
      ...value,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    try {
      const duplicates = await findContactDuplicates(input);
      if (
        duplicates.length &&
        !window.confirm(
          `Possível duplicidade: ${duplicates.map((item) => `${item.name} — ${item.reason}`).join("; ")}. Deseja salvar mesmo assim?`,
        )
      )
        return;
      onSaved(await saveContact(input));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={initial.id ? "Editar contato" : "Novo contato"}
      onClose={onClose}
      wide
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <Feedback error={error} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome" required>
            <input
              autoFocus
              value={value.name}
              onChange={(event) =>
                setValue({ ...value, name: event.target.value })
              }
            />
          </Field>
          <Field label="Tipo" required>
            <select
              value={value.contactKind}
              onChange={(event) =>
                setValue({
                  ...value,
                  contactKind: event.target
                    .value as ContactInput["contactKind"],
                })
              }
            >
              <option value="PERSON">Pessoa física</option>
              <option value="COMPANY">Pessoa jurídica</option>
            </select>
          </Field>
          <Field label="Nome fantasia">
            <input value={value.tradeName ?? ""} onChange={text("tradeName")} />
          </Field>
          <Field label="CPF, CNPJ ou documento">
            <input
              value={value.documentNumber ?? ""}
              onChange={text("documentNumber")}
            />
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-slate-800">
            Papéis *
          </legend>
          <div className="mt-2 flex gap-5">
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={value.roleCustomer}
                onChange={(event) =>
                  setValue({ ...value, roleCustomer: event.target.checked })
                }
              />
              Cliente
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={value.roleSupplier}
                onChange={(event) =>
                  setValue({ ...value, roleSupplier: event.target.checked })
                }
              />
              Fornecedor
            </label>
          </div>
        </fieldset>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Telefone">
            <input value={value.phone ?? ""} onChange={text("phone")} />
          </Field>
          <Field label="WhatsApp">
            <input value={value.whatsapp ?? ""} onChange={text("whatsapp")} />
          </Field>
          <Field label="E-mail">
            <input
              type="email"
              value={value.email ?? ""}
              onChange={text("email")}
            />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-[2fr_1fr_5rem_1fr]">
          <Field label="Endereço">
            <input value={value.address ?? ""} onChange={text("address")} />
          </Field>
          <Field label="Cidade">
            <input value={value.city ?? ""} onChange={text("city")} />
          </Field>
          <Field label="UF">
            <input
              maxLength={3}
              value={value.state ?? ""}
              onChange={text("state")}
            />
          </Field>
          <Field label="CEP">
            <input
              value={value.postalCode ?? ""}
              onChange={text("postalCode")}
            />
          </Field>
        </div>
        <Field label="Tags" hint="Separe por vírgulas.">
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </Field>
        <Field label="Observações">
          <textarea
            rows={4}
            value={value.notes ?? ""}
            onChange={text("notes")}
          />
        </Field>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold"
          >
            Cancelar
          </button>
          <button
            disabled={busy}
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Salvando…" : "Salvar contato"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ContactDetailModal({
  contact,
  onClose,
  onEdit,
}: {
  contact: ContactDetail;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [tab, setTab] = useState("summary");
  const tabs = [
    ["summary", "Resumo"],
    ["sales", "Vendas"],
    ["receivable", "Contas a receber"],
    ["payable", "Contas a pagar"],
    ["movements", "Movimentações"],
    ["notes", "Observações"],
    ["history", "Histórico"],
  ];
  const financialEntries = contact.financialEntries ?? [];
  return (
    <Modal title={contact.name} onClose={onClose} wide>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span
            className={`rounded-full px-2 py-1 text-xs font-semibold ${contact.isActive ? "bg-green-50 text-positive" : "bg-slate-100 text-slate-600"}`}
          >
            {contact.isActive ? "Ativo" : "Inativo"}
          </span>
          <span className="ml-2 text-sm text-slate-500">
            {roleLabel(contact)}
          </span>
        </div>
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-semibold"
        >
          <Pencil size={16} />
          Editar
        </button>
      </div>
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === id ? "border-brand text-brand" : "border-transparent text-slate-500"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="py-5">
        {tab === "summary" && (
          <div className="grid gap-4 md:grid-cols-3">
            <Metric
              label="Total movimentado"
              value={money.format(contact.totalMovedCents / 100)}
            />
            <Metric
              label="A receber"
              value={money.format(contact.receivableCents / 100)}
            />
            <Metric
              label="A pagar"
              value={money.format(contact.payableCents / 100)}
            />
            <Info label="Documento" value={contact.documentNumber} />
            <Info label="Telefone" value={contact.phone} />
            <Info label="WhatsApp" value={contact.whatsapp} />
            <Info label="E-mail" value={contact.email} />
            <Info
              label="Cidade/UF"
              value={[contact.city, contact.state].filter(Boolean).join("/")}
            />
            <Info label="Tags" value={contact.tags.join(", ")} />
          </div>
        )}
        {tab === "sales" && <ContactSales sales={contact.sales ?? []} />}
        {tab === "receivable" && (
          <ContactEntries
            entries={financialEntries.filter(
              (entry) =>
                entry.entryType === "REVENUE" && entry.remainingAmountCents > 0,
            )}
            empty="Nenhuma conta a receber para este contato."
          />
        )}
        {tab === "payable" && (
          <ContactEntries
            entries={financialEntries.filter(
              (entry) =>
                entry.entryType === "EXPENSE" && entry.remainingAmountCents > 0,
            )}
            empty="Nenhuma conta a pagar para este contato."
          />
        )}
        {tab === "movements" && (
          <ContactEntries
            entries={financialEntries}
            empty="Nenhuma movimentação vinculada."
          />
        )}
        {tab === "notes" && (
          <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            {contact.notes || "Nenhuma observação cadastrada."}
          </p>
        )}
        {tab === "history" &&
          (contact.history.length ? (
            <ol className="space-y-3">
              {contact.history.map((entry, index) => (
                <li
                  key={`${entry.createdAt}-${index}`}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <p className="font-medium text-ink">{entry.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {entry.action} ·{" "}
                    {new Date(entry.createdAt).toLocaleString("pt-BR")}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              title="Sem histórico"
              text="As alterações auditáveis aparecerão aqui."
            />
          ))}
      </div>
    </Modal>
  );
}
function ContactSales({ sales }: { sales: ContactSale[] }) {
  if (!sales.length)
    return (
      <EmptyState
        title="Nenhuma venda"
        text="As vendas confirmadas ou em rascunho aparecerão aqui."
      />
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className="p-2">Número</th>
            <th className="p-2">Data</th>
            <th className="p-2">Descrição</th>
            <th className="p-2 text-right">Total</th>
            <th className="p-2 text-right">Recebido</th>
            <th className="p-2 text-right">Pendente</th>
            <th className="p-2">Situação</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id} className="border-t">
              <td className="p-2 font-semibold text-brand">{sale.number}</td>
              <td className="p-2">
                {new Date(`${sale.issueDate}T00:00:00`).toLocaleDateString(
                  "pt-BR",
                )}
              </td>
              <td className="p-2">{sale.description}</td>
              <td className="p-2 text-right">
                {money.format(sale.netAmountCents / 100)}
              </td>
              <td className="p-2 text-right">
                {money.format(sale.receivedAmountCents / 100)}
              </td>
              <td className="p-2 text-right">
                {money.format(sale.remainingAmountCents / 100)}
              </td>
              <td className="p-2">{sale.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-ink">{value}</p>
    </div>
  );
}
function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-ink">{value || "—"}</p>
    </div>
  );
}
function ContactEntries({
  entries,
  empty,
}: {
  entries: ContactFinancialEntry[];
  empty: string;
}) {
  if (!entries.length)
    return <EmptyState title="Nenhum registro financeiro" text={empty} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className="p-2">Data</th>
            <th className="p-2">Descrição</th>
            <th className="p-2">Tipo</th>
            <th className="p-2 text-right">Valor</th>
            <th className="p-2 text-right">Pendente</th>
            <th className="p-2">Situação</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-t">
              <td className="p-2">
                {new Date(`${entry.issueDate}T00:00:00`).toLocaleDateString(
                  "pt-BR",
                )}
              </td>
              <td className="p-2 font-medium">{entry.description}</td>
              <td className="p-2">
                {entry.entryType === "REVENUE"
                  ? "Receita"
                  : entry.entryType === "EXPENSE"
                    ? "Despesa"
                    : entry.entryType}
              </td>
              <td className="p-2 text-right">
                {money.format(entry.grossAmountCents / 100)}
              </td>
              <td className="p-2 text-right">
                {money.format(entry.remainingAmountCents / 100)}
              </td>
              <td className="p-2">{entry.displayStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const emptyMapping: ContactCsvMapping = {
  name: "",
  contactKind: null,
  roleCustomer: null,
  roleSupplier: null,
  tradeName: null,
  documentNumber: null,
  phone: null,
  whatsapp: null,
  email: null,
  address: null,
  city: null,
  state: null,
  postalCode: null,
  notes: null,
  tags: null,
};
const mappingLabels: [keyof ContactCsvMapping, string, boolean][] = [
  ["name", "Nome", true],
  ["contactKind", "Tipo", false],
  ["roleCustomer", "É cliente", false],
  ["roleSupplier", "É fornecedor", false],
  ["tradeName", "Nome fantasia", false],
  ["documentNumber", "Documento", false],
  ["phone", "Telefone", false],
  ["whatsapp", "WhatsApp", false],
  ["email", "E-mail", false],
  ["address", "Endereço", false],
  ["city", "Cidade", false],
  ["state", "Estado", false],
  ["postalCode", "CEP", false],
  ["notes", "Observações", false],
  ["tags", "Tags", false],
];
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll("_", " ");
}
function guessMapping(headers: string[]): ContactCsvMapping {
  const aliases: Record<keyof ContactCsvMapping, string[]> = {
    name: ["nome", "name"],
    contactKind: ["tipo", "tipo contato"],
    roleCustomer: ["cliente", "e cliente"],
    roleSupplier: ["fornecedor", "e fornecedor"],
    tradeName: ["nome fantasia"],
    documentNumber: ["documento", "cpf", "cnpj"],
    phone: ["telefone", "phone"],
    whatsapp: ["whatsapp", "whats"],
    email: ["email", "e mail"],
    address: ["endereco", "address"],
    city: ["cidade", "city"],
    state: ["estado", "uf", "state"],
    postalCode: ["cep", "postal code"],
    notes: ["observacoes", "notas"],
    tags: ["tags", "etiquetas"],
  };
  const result = { ...emptyMapping };
  for (const key of Object.keys(aliases) as (keyof ContactCsvMapping)[]) {
    const found = headers.find((header) =>
      aliases[key].includes(normalize(header)),
    );
    if (found) result[key] = found;
  }
  return result;
}

function ContactImport({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const [path, setPath] = useState<string | null>(null);
  const [file, setFile] = useState<CsvFilePreview | null>(null);
  const [mapping, setMapping] = useState<ContactCsvMapping>(emptyMapping);
  const [validation, setValidation] = useState<ContactImportPreview | null>(
    null,
  );
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectFile = async () => {
    const selected = await chooseContactCsv();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const preview = await readContactCsv(selected);
      setPath(selected);
      setFile(preview);
      setMapping(guessMapping(preview.headers));
      setValidation(null);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  const validate = async () => {
    if (!path) return;
    setBusy(true);
    setError(null);
    try {
      setValidation(await previewContactImport(path, mapping));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!path || !validation || validation.errorRows) return;
    if (!window.confirm(`Importar ${validation.validRows} contato(s)?`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importContacts(path, mapping, allowDuplicates);
      onImported(result.imported);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Importar contatos por CSV" onClose={onClose} wide>
      <div className="space-y-5">
        <Feedback error={error} />
        <ol className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
          <li
            className={`rounded p-2 ${file ? "bg-green-50 text-positive" : "bg-blue-50 text-brand"}`}
          >
            1. Arquivo
          </li>
          <li
            className={`rounded p-2 ${validation ? "bg-green-50 text-positive" : file ? "bg-blue-50 text-brand" : "bg-slate-100 text-slate-400"}`}
          >
            2. Mapear e validar
          </li>
          <li
            className={`rounded p-2 ${validation ? "bg-blue-50 text-brand" : "bg-slate-100 text-slate-400"}`}
          >
            3. Confirmar
          </li>
        </ol>
        {!file ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
            <Upload className="mx-auto text-slate-400" />
            <p className="mt-3 text-sm text-slate-600">
              Selecione um CSV de até 10 MB e 10.000 registros.
            </p>
            <button
              disabled={busy}
              onClick={() => void selectFile()}
              className="mt-4 rounded-lg bg-brand px-4 py-2 font-semibold text-white"
            >
              Selecionar CSV
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm">
              <span>
                {file.totalRows} linha(s), {file.headers.length} coluna(s)
              </span>
              <button
                onClick={() => void selectFile()}
                className="font-semibold text-brand"
              >
                Trocar arquivo
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mappingLabels.map(([key, label, required]) => (
                <Field key={key} label={label} required={required}>
                  <select
                    value={mapping[key] ?? ""}
                    onChange={(event) => {
                      setMapping({
                        ...mapping,
                        [key]: event.target.value || null,
                      });
                      setValidation(null);
                    }}
                  >
                    <option value="">Não importar</option>
                    {file.headers.map((header) => (
                      <option key={header}>{header}</option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {file.headers.map((header) => (
                      <th key={header} className="px-3 py-2 text-left">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {file.sampleRows.map((row, index) => (
                    <tr key={index}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="border-t px-3 py-2">
                          {cell || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!validation ? (
              <div className="flex justify-end">
                <button
                  disabled={busy || !mapping.name}
                  onClick={() => void validate()}
                  className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-40"
                >
                  Validar importação
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Metric label="Linhas" value={String(validation.totalRows)} />
                  <Metric
                    label="Válidas"
                    value={String(validation.validRows)}
                  />
                  <Metric
                    label="Com erro"
                    value={String(validation.errorRows)}
                  />
                  <Metric
                    label="Possíveis duplicadas"
                    value={String(validation.duplicateRows)}
                  />
                </div>
                {validation.rows.some(
                  (row) => row.errors.length || row.possibleDuplicates.length,
                ) && (
                  <div className="max-h-52 overflow-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Linha</th>
                          <th className="px-3 py-2 text-left">Nome</th>
                          <th className="px-3 py-2 text-left">Resultado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validation.rows
                          .filter(
                            (row) =>
                              row.errors.length ||
                              row.possibleDuplicates.length,
                          )
                          .map((row) => (
                            <tr key={row.line} className="border-t">
                              <td className="px-3 py-2">{row.line}</td>
                              <td className="px-3 py-2">{row.name || "—"}</td>
                              <td className="px-3 py-2 text-slate-600">
                                {[
                                  ...row.errors,
                                  ...row.possibleDuplicates,
                                ].join("; ")}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {validation.duplicateRows > 0 && (
                  <label className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={allowDuplicates}
                      onChange={(event) =>
                        setAllowDuplicates(event.target.checked)
                      }
                    />
                    Confirmo que revisei e desejo importar as possíveis
                    duplicidades.
                  </label>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setValidation(null)}
                    className="rounded-lg border border-slate-300 px-4 py-2 font-semibold"
                  >
                    Rever mapeamento
                  </button>
                  <button
                    disabled={
                      busy ||
                      validation.errorRows > 0 ||
                      (validation.duplicateRows > 0 && !allowDuplicates)
                    }
                    onClick={() => void confirm()}
                    className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-40"
                  >
                    Confirmar importação
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
