import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import {
  deleteMaster,
  listReferenceData,
  saveAccount,
  saveCategory,
  savePaymentMethod,
  setMasterActive,
  type AccountInput,
  type CategoryInput,
  type PaymentMethodInput,
  type ReferenceItem,
} from "../../infrastructure/masters";
import { centsInput, money, parseMoney } from "../../domain/display";
import { EmptyState, Feedback, Field, Modal } from "./components";

type Resource = "categories" | "accounts" | "paymentMethods";
const labels: Record<Resource, string> = {
  categories: "Categorias",
  accounts: "Contas financeiras",
  paymentMethods: "Formas de pagamento",
};

export function MasterDataPage() {
  const [resource, setResource] = useState<Resource>("categories");
  const [items, setItems] = useState<ReferenceItem[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ReferenceItem | "new" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listReferenceData(resource));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }, [resource]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const notify = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(null), 4000);
  };
  const toggle = async (item: ReferenceItem) => {
    const deactivating = item.isActive;
    if (
      !window.confirm(`${deactivating ? "Inativar" : "Reativar"} ${item.name}?`)
    )
      return;
    try {
      await setMasterActive(resource, item.id, !deactivating);
      notify(deactivating ? "Cadastro inativado." : "Cadastro reativado.");
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  };
  const remove = async (item: ReferenceItem) => {
    if (!window.confirm(`Excluir ${item.name}?`)) return;
    try {
      await deleteMaster(resource, item.id);
      notify("Cadastro excluído.");
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  };
  const visible = items.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.detail.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="mx-auto max-w-6xl py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Cadastros básicos</h1>
          <p className="mt-1 text-slate-600">
            Organize categorias, contas e recebimentos usados pelo financeiro.
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 font-semibold text-white"
        >
          <Plus size={17} />
          Novo cadastro
        </button>
      </header>
      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {(Object.keys(labels) as Resource[]).map((value) => (
          <button
            key={value}
            onClick={() => {
              setResource(value);
              setSearch("");
            }}
            className={`border-b-2 px-4 py-3 text-sm font-semibold ${resource === value ? "border-brand text-brand" : "border-transparent text-slate-500"}`}
          >
            {labels[value]}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        <Feedback message={message} error={error} />
        <input
          aria-label={`Pesquisar em ${labels[resource]}`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Pesquisar neste cadastro"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
        />
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-surface">
        {loading ? (
          <p className="p-6 text-slate-500">Carregando…</p>
        ) : visible.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nenhum cadastro encontrado"
              text="Crie um registro ou ajuste a pesquisa."
            />
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Detalhes</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-ink">
                    {item.name}
                    {item.isSystem && (
                      <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-xs text-brand">
                        Sistema
                      </span>
                    )}
                    {item.isDefault && (
                      <span className="ml-2 rounded bg-green-50 px-2 py-0.5 text-xs text-positive">
                        Padrão
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {detail(resource, item)}
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
                      <button
                        title="Editar"
                        aria-label="Editar"
                        onClick={() => setEditing(item)}
                        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        title={item.isActive ? "Inativar" : "Reativar"}
                        aria-label={item.isActive ? "Inativar" : "Reativar"}
                        onClick={() => void toggle(item)}
                        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                      >
                        <Power size={16} />
                      </button>
                      <button
                        title="Excluir"
                        aria-label="Excluir"
                        onClick={() => void remove(item)}
                        className="rounded-lg p-2 text-critical hover:bg-red-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && resource === "categories" && (
        <CategoryForm
          item={editing === "new" ? null : editing}
          items={items}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            notify(
              editing === "new" ? "Categoria criada." : "Categoria atualizada.",
            );
            setEditing(null);
            await refresh();
          }}
        />
      )}
      {editing && resource === "accounts" && (
        <AccountForm
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            notify(editing === "new" ? "Conta criada." : "Conta atualizada.");
            setEditing(null);
            await refresh();
          }}
        />
      )}
      {editing && resource === "paymentMethods" && (
        <PaymentForm
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            notify(
              editing === "new"
                ? "Forma de pagamento criada."
                : "Forma de pagamento atualizada.",
            );
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </section>
  );
}

function detail(resource: Resource, item: ReferenceItem) {
  if (resource === "categories")
    return `${item.detail === "REVENUE" ? "Receita" : "Despesa"}${item.parentId ? " · Subcategoria" : ""}`;
  if (resource === "accounts")
    return `${accountTypes[item.detail] ?? item.detail} · ${money.format((item.amountCents ?? 0) / 100)}${item.institution ? ` · ${item.institution}` : ""}`;
  return `${paymentTypes[item.detail] ?? item.detail} · taxa ${((item.feeBasisPoints ?? 0) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% · ${item.receiptDelayDays ?? 0} dia(s)`;
}
const accountTypes: Record<string, string> = {
  CASH: "Caixa",
  BANK: "Banco",
  DIGITAL: "Conta digital",
  WALLET: "Carteira",
  RESERVE: "Reserva",
  OTHER: "Outro",
};
const paymentTypes: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "Pix",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  BOLETO: "Boleto",
  TRANSFER: "Transferência",
  TERM: "Prazo",
  OTHER: "Outro",
};

function CategoryForm({
  item,
  items,
  onClose,
  onSaved,
}: {
  item: ReferenceItem | null;
  items: ReferenceItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<CategoryInput>({
    id: item?.id ?? null,
    name: item?.name ?? "",
    nature: item?.detail === "EXPENSE" ? "EXPENSE" : "REVENUE",
    parentId: item?.parentId ?? null,
    colorReference: item?.colorReference ?? "#2563EB",
    iconReference: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parents = items.filter(
    (candidate) =>
      candidate.id !== value.id && candidate.detail === value.nature,
  );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveCategory(value);
      onSaved();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={item ? "Editar categoria" : "Nova categoria"}
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <Feedback error={error} />
        <Field label="Nome" required>
          <input
            autoFocus
            value={value.name}
            onChange={(event) =>
              setValue({ ...value, name: event.target.value })
            }
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Natureza" required>
            <select
              value={value.nature}
              onChange={(event) =>
                setValue({
                  ...value,
                  nature: event.target.value as CategoryInput["nature"],
                  parentId: null,
                })
              }
            >
              <option value="REVENUE">Receita</option>
              <option value="EXPENSE">Despesa</option>
            </select>
          </Field>
          <Field label="Categoria-pai">
            <select
              value={value.parentId ?? ""}
              onChange={(event) =>
                setValue({ ...value, parentId: event.target.value || null })
              }
            >
              <option value="">Categoria principal</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cor">
            <input
              type="color"
              value={value.colorReference ?? "#2563EB"}
              onChange={(event) =>
                setValue({ ...value, colorReference: event.target.value })
              }
            />
          </Field>
          <Field label="Ícone" hint="Nome opcional">
            <input
              value={value.iconReference ?? ""}
              onChange={(event) =>
                setValue({
                  ...value,
                  iconReference: event.target.value || null,
                })
              }
            />
          </Field>
        </div>
        <Buttons busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}

function AccountForm({
  item,
  onClose,
  onSaved,
}: {
  item: ReferenceItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<AccountInput>({
    id: item?.id ?? null,
    name: item?.name ?? "",
    accountType: item?.detail ?? "BANK",
    institution: item?.institution ?? null,
    openingBalanceCents: item?.amountCents ?? 0,
    openingBalanceDate: item?.date ?? new Date().toISOString().slice(0, 10),
    colorReference: item?.colorReference ?? "#2563EB",
    isDefault: item?.isDefault ?? false,
  });
  const [balance, setBalance] = useState(centsInput(value.openingBalanceCents));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cents = parseMoney(balance);
    if (cents === null || Number.isNaN(cents)) {
      setError("Informe um saldo inicial válido.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveAccount({ ...value, openingBalanceCents: cents });
      onSaved();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={item ? "Editar conta financeira" : "Nova conta financeira"}
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <Feedback error={error} />
        <Field label="Nome" required>
          <input
            autoFocus
            value={value.name}
            onChange={(event) =>
              setValue({ ...value, name: event.target.value })
            }
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo" required>
            <select
              value={value.accountType}
              onChange={(event) =>
                setValue({ ...value, accountType: event.target.value })
              }
            >
              {Object.entries(accountTypes).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Instituição">
            <input
              value={value.institution ?? ""}
              onChange={(event) =>
                setValue({ ...value, institution: event.target.value || null })
              }
            />
          </Field>
          <Field label="Saldo inicial (R$)" required>
            <input
              inputMode="decimal"
              value={balance}
              onChange={(event) => setBalance(event.target.value)}
            />
          </Field>
          <Field label="Data do saldo" required>
            <input
              type="date"
              value={value.openingBalanceDate}
              onChange={(event) =>
                setValue({ ...value, openingBalanceDate: event.target.value })
              }
            />
          </Field>
          <Field label="Cor">
            <input
              type="color"
              value={value.colorReference ?? "#2563EB"}
              onChange={(event) =>
                setValue({ ...value, colorReference: event.target.value })
              }
            />
          </Field>
        </div>
        <label className="flex gap-2 rounded-lg bg-slate-50 p-3 text-sm">
          <input
            type="checkbox"
            checked={value.isDefault}
            disabled={item?.isDefault}
            onChange={(event) =>
              setValue({ ...value, isDefault: event.target.checked })
            }
          />
          Usar como conta padrão
          {item?.isDefault && " (selecione outra conta para alterar)"}
        </label>
        <Buttons busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}

function PaymentForm({
  item,
  onClose,
  onSaved,
}: {
  item: ReferenceItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<PaymentMethodInput>({
    id: item?.id ?? null,
    name: item?.name ?? "",
    paymentType: item?.detail ?? "OTHER",
    defaultFeeBasisPoints: item?.feeBasisPoints ?? 0,
    defaultReceiptDelayDays: item?.receiptDelayDays ?? 0,
  });
  const [fee, setFee] = useState(
    String(value.defaultFeeBasisPoints / 100).replace(".", ","),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const percentage = Number(fee.replace(",", "."));
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      setError("Informe uma taxa entre 0% e 100%.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await savePaymentMethod({
        ...value,
        defaultFeeBasisPoints: Math.round(percentage * 100),
      });
      onSaved();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={item ? "Editar forma de pagamento" : "Nova forma de pagamento"}
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <Feedback error={error} />
        <Field label="Nome" required>
          <input
            autoFocus
            value={value.name}
            onChange={(event) =>
              setValue({ ...value, name: event.target.value })
            }
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo" required>
            <select
              value={value.paymentType}
              onChange={(event) =>
                setValue({ ...value, paymentType: event.target.value })
              }
            >
              {Object.entries(paymentTypes).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Taxa padrão (%)">
            <input
              inputMode="decimal"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
            />
          </Field>
          <Field label="Prazo para recebimento (dias)">
            <input
              type="number"
              min="0"
              max="3650"
              value={value.defaultReceiptDelayDays}
              onChange={(event) =>
                setValue({
                  ...value,
                  defaultReceiptDelayDays: Number(event.target.value),
                })
              }
            />
          </Field>
        </div>
        {item?.isSystem && (
          <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
            Forma padrão do sistema: pode ser editada ou inativada, mas não
            excluída.
          </p>
        )}
        <Buttons busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}

function Buttons({ busy, onClose }: { busy: boolean; onClose: () => void }) {
  return (
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
        {busy ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}
