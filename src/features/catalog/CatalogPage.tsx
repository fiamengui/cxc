import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import {
  deleteMaster,
  listCatalog,
  saveCatalogItem,
  setMasterActive,
  type CatalogItem,
  type CatalogItemInput,
} from "../../infrastructure/masters";
import { centsInput, money, parseMoney } from "../../domain/display";
import { EmptyState, Feedback, Field, Modal } from "../masters/components";

const empty: CatalogItemInput = {
  id: null,
  name: "",
  itemType: "PRODUCT",
  code: null,
  description: null,
  category: null,
  salePriceCents: 0,
  costPriceCents: null,
  unit: "UN",
};
const pageSize = 25;

export function CatalogPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [status, setStatus] = useState("ACTIVE");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<CatalogItemInput | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listCatalog({
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
  const notify = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(null), 4000);
  };
  const toggle = async (item: CatalogItem) => {
    const deactivating = item.isActive;
    if (
      !window.confirm(`${deactivating ? "Inativar" : "Reativar"} ${item.name}?`)
    )
      return;
    try {
      await setMasterActive("catalog", item.id, !deactivating);
      notify(deactivating ? "Item inativado." : "Item reativado.");
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  };
  const remove = async (item: CatalogItem) => {
    if (!window.confirm(`Excluir ${item.name}?`)) return;
    try {
      await deleteMaster("catalog", item.id);
      notify("Item excluído.");
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  };
  return (
    <section className="mx-auto max-w-7xl py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Produtos e serviços</h1>
          <p className="mt-1 text-slate-600">
            Catálogo comercial sem controle de estoque.
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...empty })}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 font-semibold text-white"
        >
          <Plus size={17} />
          Novo item
        </button>
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
            <span className="sr-only">Pesquisar produtos e serviços</span>
            <Search
              className="absolute left-3 top-2.5 text-slate-400"
              size={18}
            />
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Código, nome ou categoria"
              className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3"
            />
          </label>
          <select
            aria-label="Tipo do item"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-slate-300 px-3"
          >
            <option value="ALL">Todos os tipos</option>
            <option value="PRODUCT">Produtos</option>
            <option value="SERVICE">Serviços</option>
          </select>
          <select
            aria-label="Situação do item"
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
          <p className="p-6 text-slate-500">Carregando catálogo…</p>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nenhum item encontrado"
              text="Cadastre o primeiro produto ou serviço, ou ajuste os filtros."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3 text-right">Venda</th>
                  <th className="px-4 py-3 text-right">Custo</th>
                  <th className="px-4 py-3">Unidade</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{item.code ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold text-ink">
                      {item.name}
                      {item.isDemo && (
                        <span className="ml-2 rounded bg-violet-50 px-2 py-0.5 text-xs text-violet-700">
                          Exemplo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.itemType === "PRODUCT" ? "Produto" : "Serviço"}
                    </td>
                    <td className="px-4 py-3">{item.category ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {money.format(item.salePriceCents / 100)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.costPriceCents === null
                        ? "—"
                        : money.format(item.costPriceCents / 100)}
                    </td>
                    <td className="px-4 py-3">{item.unit}</td>
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
                          onClick={() => setEditing(toInput(item))}
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
          </div>
        )}
      </div>
      <footer className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>{total} item(ns)</span>
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
      {editing && (
        <CatalogForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            notify(editing.id ? "Item atualizado." : "Item criado.");
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </section>
  );
}

function toInput(item: CatalogItem): CatalogItemInput {
  return {
    id: item.id,
    name: item.name,
    itemType: item.itemType,
    code: item.code,
    description: item.description,
    category: item.category,
    salePriceCents: item.salePriceCents,
    costPriceCents: item.costPriceCents,
    unit: item.unit,
  };
}
function CatalogForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: CatalogItemInput;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [salePrice, setSalePrice] = useState(
    centsInput(initial.salePriceCents),
  );
  const [costPrice, setCostPrice] = useState(
    centsInput(initial.costPriceCents),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const text =
    (field: keyof CatalogItemInput) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue((current) => ({
        ...current,
        [field]: event.target.value || null,
      }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const sale = parseMoney(salePrice);
    const cost = parseMoney(costPrice);
    if (value.name.trim().length < 2) {
      setError("Informe o nome do item.");
      return;
    }
    if (sale === null || Number.isNaN(sale) || Number.isNaN(cost)) {
      setError("Revise os valores de venda e custo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveCatalogItem({
        ...value,
        salePriceCents: sale,
        costPriceCents: cost,
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
      title={
        initial.id ? "Editar produto ou serviço" : "Novo produto ou serviço"
      }
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <Feedback error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
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
              value={value.itemType}
              onChange={(event) =>
                setValue({
                  ...value,
                  itemType: event.target.value as CatalogItemInput["itemType"],
                })
              }
            >
              <option value="PRODUCT">Produto</option>
              <option value="SERVICE">Serviço</option>
            </select>
          </Field>
          <Field label="Código">
            <input value={value.code ?? ""} onChange={text("code")} />
          </Field>
          <Field label="Categoria">
            <input value={value.category ?? ""} onChange={text("category")} />
          </Field>
          <Field label="Valor de venda (R$)" required>
            <input
              inputMode="decimal"
              value={salePrice}
              onChange={(event) => setSalePrice(event.target.value)}
            />
          </Field>
          <Field label="Custo (R$)" hint="Opcional">
            <input
              inputMode="decimal"
              value={costPrice}
              onChange={(event) => setCostPrice(event.target.value)}
            />
          </Field>
          <Field label="Unidade" required>
            <select
              value={value.unit}
              onChange={(event) =>
                setValue({ ...value, unit: event.target.value })
              }
            >
              <option value="UN">Unidade</option>
              <option value="H">Hora</option>
              <option value="KG">Quilograma</option>
              <option value="M">Metro</option>
              <option value="L">Litro</option>
              <option value="CX">Caixa</option>
              <option value="PAC">Pacote</option>
            </select>
          </Field>
        </div>
        <Field label="Descrição">
          <textarea
            rows={4}
            value={value.description ?? ""}
            onChange={text("description")}
          />
        </Field>
        <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          O catálogo não controla estoque. Alterar preços aqui não modifica
          vendas antigas.
        </p>
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
            {busy ? "Salvando…" : "Salvar item"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
