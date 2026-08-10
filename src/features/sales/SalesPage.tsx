import { useCallback, useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Copy,
  Download,
  Eye,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { centsInput, money, parseMoney } from "../../domain/display";
import {
  calculateSaleTotals,
  parseQuantityToMillis,
  quantityInput,
} from "../../domain/sales";
import {
  getFinanceOptions,
  reverseFinancialEntry,
  type EntrySummary,
  type FinanceOptions,
} from "../../infrastructure/finance";
import {
  cancelSale,
  exportSaleReceiptPdf,
  getSale,
  getSalesOptions,
  listSales,
  saveSale,
  type SaleDetail,
  type SaleInput,
  type SaleItemInput,
  type SaleSummary,
  type SalesOptions,
} from "../../infrastructure/sales";
import { EmptyState, Feedback, Field, Modal } from "../masters/components";
import {
  formatDate,
  isoToday,
  ReasonModal,
  SettlementModal,
  StatusBadge,
} from "../finance/shared";

const pageSize = 25;
const saleStatusLabels: Record<string, string> = {
  DRAFT: "Rascunho",
  CONFIRMED: "Confirmada",
  PARTIALLY_RECEIVED: "Parcialmente recebida",
  RECEIVED: "Recebida",
  CANCELED: "Cancelada",
};
const receiptModeLabels: Record<string, string> = {
  IMMEDIATE: "Recebimento imediato",
  FUTURE: "Recebimento futuro",
  INSTALLMENTS: "Parcelado",
  MIXED: "Parte recebida e parte pendente",
};

function emptySale(options: SalesOptions): SaleInput {
  const today = isoToday();
  return {
    id: null,
    customerId: "",
    categoryId: options.categories[0]?.id ?? "",
    issueDate: today,
    description: "Venda",
    discountAmountCents: 0,
    feeAmountCents: 0,
    receiptMode: "IMMEDIATE",
    paymentMethodId:
      options.defaultPaymentMethodId ?? options.paymentMethods[0]?.id ?? "",
    financialAccountId: options.defaultFinancialAccountId,
    installmentCount: 1,
    firstDueDate: today,
    receivedNowCents: 0,
    status: "DRAFT",
    notes: null,
    items: [blankItem()],
  };
}

function blankItem(): SaleItemInput {
  return {
    catalogItemId: null,
    description: "",
    quantityMillis: 1_000,
    unit: "UN",
    unitPriceCents: 0,
    discountCents: 0,
  };
}

function detailToInput(detail: SaleDetail, duplicate = false): SaleInput {
  const itemDiscounts = detail.items.reduce(
    (sum, item) => sum + item.discountCents,
    0,
  );
  const today = isoToday();
  return {
    id: duplicate ? null : detail.id,
    customerId: detail.customerId,
    categoryId: detail.categoryId,
    issueDate: duplicate ? today : detail.issueDate,
    description: duplicate
      ? `Cópia de ${detail.description}`
      : detail.description,
    discountAmountCents: Math.max(
      0,
      detail.discountAmountCents - itemDiscounts,
    ),
    feeAmountCents: detail.feeAmountCents,
    receiptMode: detail.receiptMode as SaleInput["receiptMode"],
    paymentMethodId: detail.paymentMethodId,
    financialAccountId: detail.financialAccountId,
    installmentCount: detail.installmentCount,
    firstDueDate: duplicate ? today : detail.firstDueDate,
    receivedNowCents: duplicate ? 0 : detail.receivedNowCents,
    status: "DRAFT",
    notes: detail.notes,
    items: detail.items.map((item) => ({
      catalogItemId: item.catalogItemId,
      description: item.description,
      quantityMillis: item.quantityMillis,
      unit: item.unit,
      unitPriceCents: item.unitPriceCents,
      discountCents: item.discountCents,
    })),
  };
}

export function SalesPage() {
  const [options, setOptions] = useState<SalesOptions | null>(null);
  const [items, setItems] = useState<SaleSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [status, setStatus] = useState("ALL");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [form, setForm] = useState<SaleInput | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<SaleSummary | SaleDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listSales({
        search,
        status,
        customerId,
        startDate,
        endDate,
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
  }, [customerId, endDate, page, search, startDate, status]);

  useEffect(() => {
    void getSalesOptions()
      .then((value) => {
        setOptions(value);
        const parameters = new URLSearchParams(window.location.search);
        const saleId = parameters.get("sale");
        if (saleId) setDetailId(saleId);
        if (parameters.get("new") === "1") setForm(emptySale(value));
      })
      .catch((reason) => setError(String(reason)));
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 4_000);
  };
  const loadForForm = async (sale: SaleSummary, duplicate = false) => {
    try {
      const detail = await getSale(sale.id);
      setForm(detailToInput(detail, duplicate));
    } catch (reason) {
      setError(String(reason));
    }
  };

  return (
    <section className="mx-auto max-w-[1500px] py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Vendas</h1>
          <p className="mt-1 text-slate-600">
            Venda simples, recebimentos conciliados e comprovante sem valor
            fiscal.
          </p>
        </div>
        {options && (
          <button
            onClick={() => setForm(emptySale(options))}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 font-semibold text-white"
          >
            <Plus size={18} /> Nova venda
          </button>
        )}
      </header>
      <div className="mt-5">
        <Feedback message={message} error={error} />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          setSearch(searchDraft.trim());
        }}
        className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-6"
      >
        <label className="relative md:col-span-2">
          <span className="sr-only">Pesquisar vendas</span>
          <Search
            size={17}
            className="absolute left-3 top-2.5 text-slate-400"
          />
          <input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Número, cliente ou descrição"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3"
          />
        </label>
        <select
          aria-label="Situação da venda"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(0);
          }}
          className="rounded-lg border border-slate-300 px-3"
        >
          <option value="ALL">Todas as situações</option>
          {Object.entries(saleStatusLabels).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Cliente da venda"
          value={customerId ?? ""}
          onChange={(event) => {
            setCustomerId(event.target.value || null);
            setPage(0);
          }}
          className="rounded-lg border border-slate-300 px-3"
        >
          <option value="">Todos os clientes</option>
          {options?.customers.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Data inicial das vendas"
          type="date"
          value={startDate ?? ""}
          onChange={(event) => setStartDate(event.target.value || null)}
          className="rounded-lg border border-slate-300 px-3"
        />
        <input
          aria-label="Data final das vendas"
          type="date"
          value={endDate ?? ""}
          onChange={(event) => setEndDate(event.target.value || null)}
          className="rounded-lg border border-slate-300 px-3"
        />
        <button className="rounded-lg bg-ink px-4 py-2 font-semibold text-white md:col-start-6">
          Pesquisar
        </button>
      </form>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-surface">
        {loading ? (
          <p className="p-6 text-slate-500">Carregando vendas…</p>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nenhuma venda encontrada"
              text="Registre a primeira venda ou ajuste os filtros."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-3">Número</th>
                  <th className="px-3 py-3">Data</th>
                  <th className="px-3 py-3">Cliente</th>
                  <th className="px-3 py-3">Descrição</th>
                  <th className="px-3 py-3">Recebimento</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-3 py-3 text-right">Recebido</th>
                  <th className="px-3 py-3 text-right">Pendente</th>
                  <th className="px-3 py-3">Situação</th>
                  <th className="px-3 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <button
                        onClick={() => setDetailId(sale.id)}
                        className="font-semibold text-brand hover:underline"
                      >
                        {sale.number}
                      </button>
                    </td>
                    <td className="px-3 py-3">{formatDate(sale.issueDate)}</td>
                    <td className="px-3 py-3">{sale.customerName}</td>
                    <td className="px-3 py-3">{sale.description}</td>
                    <td className="px-3 py-3">
                      {receiptModeLabels[sale.receiptMode]}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {money.format(sale.netAmountCents / 100)}
                    </td>
                    <td className="px-3 py-3 text-right text-positive">
                      {money.format(sale.receivedAmountCents / 100)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {money.format(sale.remainingAmountCents / 100)}
                    </td>
                    <td className="px-3 py-3">
                      <SaleStatus status={sale.status} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-0.5">
                        <Action
                          label="Visualizar"
                          icon={Eye}
                          onClick={() => setDetailId(sale.id)}
                        />
                        {sale.status === "DRAFT" && (
                          <Action
                            label="Editar"
                            icon={Pencil}
                            onClick={() => void loadForForm(sale)}
                          />
                        )}
                        <Action
                          label="Duplicar"
                          icon={Copy}
                          onClick={() => void loadForForm(sale, true)}
                        />
                        {sale.status !== "DRAFT" &&
                          sale.status !== "CANCELED" && (
                            <Action
                              label="Comprovante"
                              icon={ReceiptText}
                              onClick={() => setDetailId(sale.id)}
                            />
                          )}
                        {sale.status !== "CANCELED" && (
                          <Action
                            label="Cancelar venda"
                            icon={XCircle}
                            onClick={() => setCanceling(sale)}
                            critical
                          />
                        )}
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
        <span>{total} venda(s)</span>
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
      {options && form && (
        <SaleForm
          options={options}
          initial={form}
          onClose={() => setForm(null)}
          onSaved={(result) => {
            setForm(null);
            notify(
              result.status === "DRAFT"
                ? `Rascunho ${result.number} salvo.`
                : `Venda ${result.number} confirmada.`,
            );
            void refresh();
          }}
        />
      )}
      {detailId && (
        <SaleDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          onDuplicate={(detail) => {
            setDetailId(null);
            setForm(detailToInput(detail, true));
          }}
          onEdit={(detail) => {
            setDetailId(null);
            setForm(detailToInput(detail));
          }}
          onCancel={(detail) => {
            setDetailId(null);
            setCanceling(detail);
          }}
          onChanged={() => {
            void refresh();
          }}
        />
      )}
      {canceling && (
        <ReasonModal
          title={`Cancelar venda ${canceling.number}`}
          onClose={() => setCanceling(null)}
          onConfirm={async (reason) => {
            await cancelSale(canceling.id, reason);
            setCanceling(null);
            notify(
              "Venda cancelada e contas pendentes preservadas no histórico.",
            );
            await refresh();
          }}
        />
      )}
    </section>
  );
}

type DraftItem = {
  catalogItemId: string | null;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discount: string;
};

function SaleForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: SalesOptions;
  initial: SaleInput;
  onClose: () => void;
  onSaved: (result: Awaited<ReturnType<typeof saveSale>>) => void;
}) {
  const [value, setValue] = useState(initial);
  const [items, setItems] = useState<DraftItem[]>(
    initial.items.map((item) => ({
      catalogItemId: item.catalogItemId,
      description: item.description,
      quantity: quantityInput(item.quantityMillis),
      unit: item.unit,
      unitPrice: centsInput(item.unitPriceCents),
      discount: centsInput(item.discountCents),
    })),
  );
  const [saleDiscount, setSaleDiscount] = useState(
    centsInput(initial.discountAmountCents),
  );
  const [fee, setFee] = useState(centsInput(initial.feeAmountCents));
  const [receivedNow, setReceivedNow] = useState(
    centsInput(initial.receivedNowCents),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => {
    try {
      const parsedItems = items.map((item) => ({
        quantityMillis: parseQuantityToMillis(item.quantity) ?? 0,
        unitPriceCents: parseMoney(item.unitPrice) ?? 0,
        discountCents: parseMoney(item.discount) ?? 0,
      }));
      if (parsedItems.some((item) => Object.values(item).some(Number.isNaN)))
        return null;
      const discount = parseMoney(saleDiscount) ?? 0;
      const fees = parseMoney(fee) ?? 0;
      if (Number.isNaN(discount) || Number.isNaN(fees)) return null;
      return calculateSaleTotals(parsedItems, discount, fees);
    } catch {
      return null;
    }
  }, [fee, items, saleDiscount]);

  const updateItem = (index: number, patch: Partial<DraftItem>) =>
    setItems((current) =>
      current.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    );
  const chooseCatalog = (index: number, catalogId: string) => {
    const catalog = options.catalogItems.find((item) => item.id === catalogId);
    updateItem(
      index,
      catalog
        ? {
            catalogItemId: catalog.id,
            description: catalog.name,
            unit: catalog.detail ?? "UN",
            unitPrice: centsInput(catalog.amountCents ?? 0),
          }
        : { catalogItemId: null },
    );
  };
  const changePayment = (id: string) => {
    const method = options.paymentMethods.find((item) => item.id === id);
    setValue((current) => ({ ...current, paymentMethodId: id }));
    if (
      parsed &&
      method?.feeBasisPoints !== null &&
      method?.feeBasisPoints !== undefined
    ) {
      setFee(
        centsInput(
          Math.round(
            (parsed.grossAmountCents * method.feeBasisPoints) / 10_000,
          ),
        ),
      );
    }
  };
  const submit = async (status: "DRAFT" | "CONFIRMED") => {
    setError(null);
    if (
      !parsed ||
      !value.customerId ||
      !value.categoryId ||
      !value.paymentMethodId
    ) {
      setError("Revise cliente, categoria, itens e valores da venda.");
      return;
    }
    const normalizedItems: SaleItemInput[] = [];
    for (const item of items) {
      const quantity = parseQuantityToMillis(item.quantity);
      const price = parseMoney(item.unitPrice);
      const discount = parseMoney(item.discount) ?? 0;
      if (
        !item.description.trim() ||
        !quantity ||
        Number.isNaN(quantity) ||
        price === null ||
        Number.isNaN(price) ||
        Number.isNaN(discount)
      ) {
        setError(
          "Revise descrição, quantidade, preço e desconto de cada item.",
        );
        return;
      }
      normalizedItems.push({
        catalogItemId: item.catalogItemId,
        description: item.description.trim(),
        quantityMillis: quantity,
        unit: item.unit || "UN",
        unitPriceCents: price,
        discountCents: discount,
      });
    }
    const mixedAmount = parseMoney(receivedNow) ?? 0;
    if (Number.isNaN(mixedAmount)) {
      setError("Revise o valor já recebido.");
      return;
    }
    const mode = value.receiptMode;
    const immediate =
      mode === "IMMEDIATE"
        ? parsed.netAmountCents
        : mode === "MIXED"
          ? mixedAmount
          : 0;
    const installmentCount =
      mode === "IMMEDIATE" || mode === "FUTURE" ? 1 : value.installmentCount;
    if (
      (mode === "IMMEDIATE" || mode === "MIXED") &&
      !value.financialAccountId
    ) {
      setError("Selecione a conta que recebeu a parte imediata.");
      return;
    }
    setBusy(true);
    try {
      const result = await saveSale({
        ...value,
        status,
        discountAmountCents: parseMoney(saleDiscount) ?? 0,
        feeAmountCents: parseMoney(fee) ?? 0,
        receivedNowCents: immediate,
        installmentCount,
        items: normalizedItems,
      });
      onSaved(result);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial.id ? "Editar rascunho de venda" : "Nova venda"}
      onClose={onClose}
      wide
    >
      <form onSubmit={(event) => event.preventDefault()} className="space-y-6">
        <Feedback error={error} />
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Cliente" required>
            <select
              value={value.customerId}
              onChange={(event) =>
                setValue({ ...value, customerId: event.target.value })
              }
            >
              <option value="">Selecione</option>
              {options.customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data" required>
            <input
              type="date"
              value={value.issueDate}
              onChange={(event) =>
                setValue({ ...value, issueDate: event.target.value })
              }
            />
          </Field>
          <Field label="Categoria de receita" required>
            <select
              value={value.categoryId}
              onChange={(event) =>
                setValue({ ...value, categoryId: event.target.value })
              }
            >
              <option value="">Selecione</option>
              {options.categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Descrição" required>
          <input
            maxLength={200}
            value={value.description}
            onChange={(event) =>
              setValue({ ...value, description: event.target.value })
            }
          />
        </Field>
        <section className="rounded-xl border border-slate-200">
          <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <h3 className="font-semibold text-ink">Itens da venda</h3>
              <p className="text-xs text-slate-500">
                Use o catálogo ou escreva um item avulso.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setItems((current) => [
                  ...current,
                  {
                    catalogItemId: null,
                    description: "",
                    quantity: "1",
                    unit: "UN",
                    unitPrice: "0,00",
                    discount: "0,00",
                  },
                ])
              }
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold"
            >
              <Plus size={16} />
              Adicionar item
            </button>
          </header>
          <div className="space-y-4 p-4">
            {items.map((item, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[1.2fr_1.5fr_.55fr_.55fr_.8fr_.8fr_auto]"
              >
                <Field label="Catálogo">
                  <select
                    value={item.catalogItemId ?? ""}
                    onChange={(event) =>
                      chooseCatalog(index, event.target.value)
                    }
                  >
                    <option value="">Item avulso</option>
                    {options.catalogItems.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Descrição" required>
                  <input
                    maxLength={200}
                    value={item.description}
                    onChange={(event) =>
                      updateItem(index, { description: event.target.value })
                    }
                  />
                </Field>
                <Field label="Quantidade" required>
                  <input
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(event) =>
                      updateItem(index, { quantity: event.target.value })
                    }
                  />
                </Field>
                <Field label="Unidade" required>
                  <input
                    maxLength={12}
                    value={item.unit}
                    onChange={(event) =>
                      updateItem(index, {
                        unit: event.target.value.toUpperCase(),
                      })
                    }
                  />
                </Field>
                <Field label="Valor unitário" required>
                  <input
                    inputMode="decimal"
                    value={item.unitPrice}
                    onChange={(event) =>
                      updateItem(index, { unitPrice: event.target.value })
                    }
                  />
                </Field>
                <Field label="Desconto">
                  <input
                    inputMode="decimal"
                    value={item.discount}
                    onChange={(event) =>
                      updateItem(index, { discount: event.target.value })
                    }
                  />
                </Field>
                <button
                  type="button"
                  aria-label={`Remover item ${index + 1}`}
                  title="Remover item"
                  disabled={items.length === 1}
                  onClick={() =>
                    setItems((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                  className="mt-6 rounded-lg p-2 text-critical hover:bg-red-50 disabled:opacity-30"
                >
                  <Trash2 size={17} />
                </button>
                <p className="text-xs font-semibold text-slate-600 md:col-span-7">
                  Total do item:{" "}
                  {parsed?.lineTotals[index] === undefined
                    ? "revise os valores"
                    : money.format(parsed.lineTotals[index] / 100)}
                </p>
              </div>
            ))}
          </div>
        </section>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Desconto adicional (R$)">
            <input
              inputMode="decimal"
              value={saleDiscount}
              onChange={(event) => setSaleDiscount(event.target.value)}
            />
          </Field>
          <Field
            label="Taxa da venda (R$)"
            hint="A taxa reduz o total líquido."
          >
            <input
              inputMode="decimal"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-3 rounded-xl bg-slate-900 p-4 text-white sm:grid-cols-4">
          <Total label="Total bruto" value={parsed?.grossAmountCents ?? 0} />
          <Total label="Descontos" value={parsed?.discountAmountCents ?? 0} />
          <Total label="Taxas" value={parsed?.feeAmountCents ?? 0} />
          <Total
            label="Total líquido"
            value={parsed?.netAmountCents ?? 0}
            strong
          />
        </div>
        <section className="space-y-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <h3 className="font-semibold text-ink">Recebimento</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Forma de recebimento" required>
              <select
                value={value.paymentMethodId}
                onChange={(event) => changePayment(event.target.value)}
              >
                <option value="">Selecione</option>
                {options.paymentMethods.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Condição" required>
              <select
                value={value.receiptMode}
                onChange={(event) =>
                  setValue({
                    ...value,
                    receiptMode: event.target.value as SaleInput["receiptMode"],
                    installmentCount:
                      event.target.value === "INSTALLMENTS"
                        ? Math.max(2, value.installmentCount)
                        : 1,
                  })
                }
              >
                {Object.entries(receiptModeLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            {(value.receiptMode === "IMMEDIATE" ||
              value.receiptMode === "MIXED") && (
              <Field label="Conta de recebimento" required>
                <select
                  value={value.financialAccountId ?? ""}
                  onChange={(event) =>
                    setValue({
                      ...value,
                      financialAccountId: event.target.value || null,
                    })
                  }
                >
                  <option value="">Selecione</option>
                  {options.accounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {(value.receiptMode === "INSTALLMENTS" ||
              value.receiptMode === "MIXED") && (
              <Field
                label={
                  value.receiptMode === "MIXED"
                    ? "Parcelas pendentes"
                    : "Quantidade de parcelas"
                }
                required
              >
                <input
                  type="number"
                  min={value.receiptMode === "INSTALLMENTS" ? 2 : 1}
                  max={value.receiptMode === "INSTALLMENTS" ? 120 : 119}
                  value={value.installmentCount}
                  onChange={(event) =>
                    setValue({
                      ...value,
                      installmentCount: Number(event.target.value),
                    })
                  }
                />
              </Field>
            )}
            {value.receiptMode !== "IMMEDIATE" && (
              <Field label="Primeiro vencimento" required>
                <input
                  type="date"
                  value={value.firstDueDate}
                  onChange={(event) =>
                    setValue({ ...value, firstDueDate: event.target.value })
                  }
                />
              </Field>
            )}
            {value.receiptMode === "MIXED" && (
              <Field label="Valor recebido agora (R$)" required>
                <input
                  inputMode="decimal"
                  value={receivedNow}
                  onChange={(event) => setReceivedNow(event.target.value)}
                />
              </Field>
            )}
          </div>
          <p className="text-xs text-blue-900">
            Ao confirmar, as contas a receber são geradas uma única vez e ficam
            vinculadas a esta venda.
          </p>
        </section>
        <Field label="Observações">
          <textarea
            maxLength={2000}
            rows={3}
            value={value.notes ?? ""}
            onChange={(event) =>
              setValue({ ...value, notes: event.target.value || null })
            }
          />
        </Field>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold"
          >
            Voltar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit("DRAFT")}
            className="rounded-lg border border-brand px-4 py-2 font-semibold text-brand disabled:opacity-50"
          >
            {busy ? "Salvando…" : "Salvar rascunho"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit("CONFIRMED")}
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Confirmando…" : "Confirmar venda"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SaleDetailModal({
  id,
  onClose,
  onDuplicate,
  onEdit,
  onCancel,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onDuplicate: (detail: SaleDetail) => void;
  onEdit: (detail: SaleDetail) => void;
  onCancel: (detail: SaleDetail) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [financeOptions, setFinanceOptions] = useState<FinanceOptions | null>(
    null,
  );
  const [tab, setTab] = useState("summary");
  const [settling, setSettling] = useState<EntrySummary | null>(null);
  const [reversing, setReversing] = useState<EntrySummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setDetail(await getSale(id));
    } catch (reason) {
      setError(String(reason));
    }
  }, [id]);
  useEffect(() => {
    void load();
    void getFinanceOptions()
      .then(setFinanceOptions)
      .catch(() => undefined);
  }, [load]);
  if (!detail)
    return (
      <Modal title="Venda" onClose={onClose}>
        <Feedback error={error} />
        <p className="text-slate-500">Carregando venda…</p>
      </Modal>
    );
  const exportPdf = async () => {
    try {
      const path = await exportSaleReceiptPdf(detail.id, detail.number);
      if (path) setMessage(`PDF salvo em ${path}`);
    } catch (reason) {
      setError(String(reason));
    }
  };
  return (
    <Modal title={`Venda ${detail.number}`} onClose={onClose} wide>
      <div className="no-print">
        <Feedback message={message} error={error} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SaleStatus status={detail.status} />
          <div className="flex flex-wrap gap-2">
            {detail.status === "DRAFT" && (
              <button
                onClick={() => onEdit(detail)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-semibold"
              >
                <Pencil size={16} />
                Editar
              </button>
            )}
            <button
              onClick={() => onDuplicate(detail)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-semibold"
            >
              <Copy size={16} />
              Duplicar
            </button>
            {detail.status !== "DRAFT" && (
              <button
                onClick={() => setTab("receipt")}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-semibold"
              >
                <ReceiptText size={16} />
                Comprovante
              </button>
            )}
            {detail.status !== "CANCELED" && (
              <button
                onClick={() => onCancel(detail)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 font-semibold text-critical"
              >
                <XCircle size={16} />
                Cancelar
              </button>
            )}
          </div>
        </div>
        <div className="mt-5 flex gap-1 overflow-x-auto border-b border-slate-200">
          {[
            ["summary", "Resumo"],
            ["items", "Itens"],
            ["receivables", "Recebimentos"],
            ["history", "Histórico"],
            ...(detail.status === "DRAFT" ? [] : [["receipt", "Comprovante"]]),
          ].map(([code, label]) => (
            <button
              key={code}
              onClick={() => setTab(code)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${tab === code ? "border-brand text-brand" : "border-transparent text-slate-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === "summary" && (
        <div className="grid gap-4 py-5 md:grid-cols-3">
          <Info label="Cliente" value={detail.customerName} />
          <Info label="Data" value={formatDate(detail.issueDate)} />
          <Info
            label="Condição"
            value={receiptModeLabels[detail.receiptMode]}
          />
          <Info
            label="Total bruto"
            value={money.format(detail.grossAmountCents / 100)}
          />
          <Info
            label="Descontos"
            value={money.format(detail.discountAmountCents / 100)}
          />
          <Info
            label="Taxas"
            value={money.format(detail.feeAmountCents / 100)}
          />
          <Info
            label="Total líquido"
            value={money.format(detail.netAmountCents / 100)}
          />
          <Info
            label="Recebido"
            value={money.format(detail.receivedAmountCents / 100)}
          />
          <Info
            label="Pendente"
            value={money.format(detail.remainingAmountCents / 100)}
          />
          <Info label="Forma" value={detail.paymentMethodName} />
          <Info
            label="Conta"
            value={detail.financialAccountName ?? "Definida na liquidação"}
          />
          <Info label="Observações" value={detail.notes ?? "—"} />
        </div>
      )}
      {tab === "items" && (
        <div className="overflow-x-auto py-5">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2 text-right">Quantidade</th>
                <th className="px-3 py-2 text-right">Unitário</th>
                <th className="px-3 py-2 text-right">Desconto</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-3">
                    {item.description}
                    <p className="text-xs text-slate-500">
                      {item.catalogItemId
                        ? "Item do catálogo congelado"
                        : "Item avulso"}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {quantityInput(item.quantityMillis)} {item.unit}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {money.format(item.unitPriceCents / 100)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {money.format(item.discountCents / 100)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">
                    {money.format(item.totalCents / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "receivables" && (
        <div className="space-y-3 py-5">
          {detail.receivables.length === 0 ? (
            <EmptyState
              title="Sem contas geradas"
              text="Confirme o rascunho para gerar os recebimentos."
            />
          ) : (
            detail.receivables.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
              >
                <div>
                  <p className="font-semibold">
                    Parcela {entry.installmentNumber}/{entry.installmentCount} ·{" "}
                    {money.format(entry.grossAmountCents / 100)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Vencimento {formatDate(entry.dueDate)} · saldo{" "}
                    {money.format(entry.remainingAmountCents / 100)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={entry.displayStatus} />
                  {entry.persistedStatus === "PENDING" &&
                    entry.remainingAmountCents > 0 &&
                    financeOptions && (
                      <button
                        onClick={() => setSettling(entry)}
                        className="rounded-lg bg-positive px-3 py-2 text-sm font-semibold text-white"
                      >
                        Receber
                      </button>
                    )}
                  {entry.settledPrincipalCents > 0 && !entry.reversedAt && (
                    <button
                      onClick={() => setReversing(entry)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-critical"
                    >
                      Estornar
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
      {tab === "history" && (
        <div className="space-y-3 py-5">
          {detail.history.map((item, index) => (
            <div
              key={`${item.createdAt}-${index}`}
              className="rounded-lg border border-slate-200 p-3"
            >
              <p className="font-medium">{item.summary}</p>
              <p className="text-xs text-slate-500">
                {item.action} ·{" "}
                {new Date(item.createdAt).toLocaleString("pt-BR")}
              </p>
            </div>
          ))}
        </div>
      )}
      {tab === "receipt" && (
        <div className="py-5">
          <div className="no-print mb-4 flex justify-end gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-semibold"
            >
              <Printer size={16} />
              Imprimir
            </button>
            <button
              onClick={() => void exportPdf()}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 font-semibold text-white"
            >
              <Download size={16} />
              Exportar PDF
            </button>
          </div>
          <Receipt detail={detail} />
        </div>
      )}
      {financeOptions && settling && (
        <SettlementModal
          entry={settling}
          options={financeOptions}
          partial
          onClose={() => setSettling(null)}
          onSaved={() => {
            setSettling(null);
            setMessage("Recebimento registrado.");
            void load();
            onChanged();
          }}
        />
      )}
      {reversing && (
        <ReasonModal
          title="Estornar recebimento da venda"
          requireDate
          onClose={() => setReversing(null)}
          onConfirm={async (reason, date) => {
            await reverseFinancialEntry(reversing.id, date, reason);
            setReversing(null);
            setMessage(
              "Recebimento estornado. A venda já pode ser cancelada quando não houver outras baixas.",
            );
            await load();
            onChanged();
          }}
        />
      )}
    </Modal>
  );
}

function Receipt({ detail }: { detail: SaleDetail }) {
  const logo = detail.business.logoPath
    ? convertFileSrc(detail.business.logoPath)
    : null;
  return (
    <article
      id="sale-receipt"
      className="mx-auto max-w-3xl border border-slate-300 bg-white p-8 text-slate-950 shadow-sm"
    >
      <header className="flex items-start justify-between gap-6 border-b border-slate-300 pb-5">
        {logo ? (
          <img
            src={logo}
            alt={`Logotipo ${detail.business.name}`}
            className="h-20 w-32 object-contain"
          />
        ) : (
          <div className="grid h-20 w-28 place-items-center rounded-lg bg-ink text-center text-sm font-bold text-white">
            Caixa no
            <br />
            Controle
          </div>
        )}
        <div className="flex-1">
          <h2 className="text-xl font-bold">{detail.business.name}</h2>
          <p className="text-sm">
            {[
              detail.business.documentNumber,
              detail.business.phone,
              detail.business.email,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-sm">
            {[
              detail.business.address,
              detail.business.city,
              detail.business.state,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>
      <div className="py-5 text-center">
        <h3 className="text-lg font-bold">Comprovante de venda</h3>
        <p className="mt-1 font-bold uppercase text-critical">
          Documento sem valor fiscal
        </p>
      </div>
      <div className="grid gap-2 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2">
        <p>
          <strong>Venda:</strong> {detail.number}
        </p>
        <p>
          <strong>Data:</strong> {formatDate(detail.issueDate)}
        </p>
        <p>
          <strong>Cliente:</strong> {detail.customerName}
        </p>
        <p>
          <strong>Pagamento:</strong> {detail.paymentMethodName}
        </p>
      </div>
      <table className="mt-5 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left">
            <th className="py-2">Item</th>
            <th className="py-2 text-right">Qtd.</th>
            <th className="py-2 text-right">Unitário</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {detail.items.map((item) => (
            <tr key={item.id} className="border-b border-slate-200">
              <td className="py-3">{item.description}</td>
              <td className="py-3 text-right">
                {quantityInput(item.quantityMillis)} {item.unit}
              </td>
              <td className="py-3 text-right">
                {money.format(item.unitPriceCents / 100)}
              </td>
              <td className="py-3 text-right">
                {money.format(item.totalCents / 100)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-5 max-w-xs space-y-2 text-sm">
        <p className="flex justify-between">
          <span>Total bruto</span>
          <strong>{money.format(detail.grossAmountCents / 100)}</strong>
        </p>
        <p className="flex justify-between">
          <span>Descontos</span>
          <strong>{money.format(detail.discountAmountCents / 100)}</strong>
        </p>
        <p className="flex justify-between">
          <span>Taxas</span>
          <strong>{money.format(detail.feeAmountCents / 100)}</strong>
        </p>
        <p className="flex justify-between border-t border-slate-400 pt-2 text-lg">
          <span>Total líquido</span>
          <strong>{money.format(detail.netAmountCents / 100)}</strong>
        </p>
      </div>
      {detail.notes && (
        <div className="mt-6 rounded-lg border border-slate-200 p-4 text-sm">
          <strong>Observações</strong>
          <p className="mt-1 whitespace-pre-wrap">{detail.notes}</p>
        </div>
      )}
      <footer className="mt-8 border-t border-slate-300 pt-4 text-center text-xs">
        <strong>DOCUMENTO SEM VALOR FISCAL</strong>
        <p className="mt-1">Gerado localmente pelo CaixaSimples - Bratec.</p>
      </footer>
    </article>
  );
}

function SaleStatus({ status }: { status: string }) {
  const style =
    status === "RECEIVED"
      ? "bg-green-50 text-positive"
      : status === "PARTIALLY_RECEIVED"
        ? "bg-amber-50 text-amber-800"
        : status === "CANCELED"
          ? "bg-slate-100 text-slate-600"
          : status === "DRAFT"
            ? "bg-violet-50 text-violet-700"
            : "bg-blue-50 text-brand";
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${style}`}
    >
      {saleStatusLabels[status] ?? status}
    </span>
  );
}

function Action({
  label,
  icon: Icon,
  onClick,
  critical,
}: {
  label: string;
  icon: typeof Eye;
  onClick: () => void;
  critical?: boolean;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`rounded-lg p-2 hover:bg-slate-100 ${critical ? "text-critical" : "text-slate-600"}`}
    >
      <Icon size={16} />
    </button>
  );
}

function Total({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-300">{label}</p>
      <p className={strong ? "text-xl font-bold" : "font-semibold"}>
        {money.format(value / 100)}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-ink">{value}</p>
    </div>
  );
}
