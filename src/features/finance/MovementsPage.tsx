import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftRight,
  CalendarClock,
  Copy,
  Eye,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  WalletCards,
  XCircle,
} from "lucide-react";
import { money, parseMoney } from "../../domain/display";
import {
  cancelFinancialEntry,
  createFinancialTransfer,
  getFinanceOptions,
  listFinancialEntries,
  listRecurrences,
  rescheduleFinancialEntry,
  reverseFinancialEntry,
  setRecurrenceActive,
  type EntryInput,
  type EntryListQuery,
  type EntrySummary,
  type FinanceOptions,
  type RecurrenceSummary,
  type TransferInput,
} from "../../infrastructure/finance";
import { EmptyState, Feedback, Field, Modal } from "../masters/components";
import {
  emptyEntry,
  EntryDetailModal,
  EntryForm,
  entryToInput,
  entryTypeLabels,
  formatDate,
  frequencyLabels,
  installmentLabel,
  isoToday,
  ReasonModal,
  RescheduleModal,
  SettlementModal,
  StatusBadge,
} from "./shared";

const pageSize = 25;
const initialQuery: EntryListQuery = {
  tab: "ALL",
  status: "ALL",
  startDate: null,
  endDate: null,
  categoryId: null,
  financialAccountId: null,
  paymentMethodId: null,
  contactId: null,
  minimumAmountCents: null,
  maximumAmountCents: null,
  search: "",
  originType: "",
  limit: pageSize,
  offset: 0,
};

export function MovementsPage() {
  const [options, setOptions] = useState<FinanceOptions | null>(null);
  const [items, setItems] = useState<EntrySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState(initialQuery);
  const [draft, setDraft] = useState(initialQuery);
  const [page, setPage] = useState(0);
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [form, setForm] = useState<EntryInput | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [recurrences, setRecurrences] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [settling, setSettling] = useState<{
    entry: EntrySummary;
    partial?: boolean;
  } | null>(null);
  const [canceling, setCanceling] = useState<EntrySummary | null>(null);
  const [reversing, setReversing] = useState<EntrySummary | null>(null);
  const [rescheduling, setRescheduling] = useState<EntrySummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listFinancialEntries({
        ...query,
        offset: page * pageSize,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }, [query, page]);
  useEffect(() => {
    void getFinanceOptions()
      .then((value) => {
        setOptions(value);
        const parameters = new URLSearchParams(window.location.search);
        const entryId = parameters.get("entry");
        const recurrenceId = parameters.get("recurrence");
        const newType = parameters.get("new");
        if (entryId) setDetailId(entryId);
        if (recurrenceId) setRecurrences(recurrenceId);
        if (newType === "REVENUE" || newType === "EXPENSE")
          setForm(emptyEntry(value, newType));
      })
      .catch((reason) => setError(String(reason)));
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const notify = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(null), 4000);
  };
  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    const min = parseMoney(minimum);
    const max = parseMoney(maximum);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      setError("Revise os filtros de valor.");
      return;
    }
    setPage(0);
    setQuery({ ...draft, minimumAmountCents: min, maximumAmountCents: max });
  };
  const saved = async (text: string) => {
    setForm(null);
    setTransfer(false);
    notify(text);
    await refresh();
  };
  const edit = (entry: EntrySummary) => setForm(entryToInput(entry));
  const duplicate = (entry: EntrySummary) => setForm(entryToInput(entry, true));
  return (
    <section className="mx-auto max-w-[1500px] py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Movimentações</h1>
          <p className="mt-1 text-slate-600">
            Receitas, despesas, aportes, retiradas, ajustes e transferências com
            histórico completo.
          </p>
        </div>
        {options && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setRecurrences("ALL")}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
            >
              <CalendarClock size={17} />
              Recorrências
            </button>
            <button
              onClick={() => setTransfer(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
            >
              <ArrowLeftRight size={17} />
              Transferir
            </button>
            <button
              onClick={() => setForm(emptyEntry(options))}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus size={17} />
              Nova movimentação
            </button>
          </div>
        )}
      </header>
      <Feedback message={message} error={error} />
      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {[
          ["ALL", "Todas"],
          ["REVENUE", "Receitas"],
          ["EXPENSE", "Despesas"],
          ["TRANSFER", "Transferências"],
          ["OWNER", "Aportes e retiradas"],
          ["CANCELED", "Canceladas"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setPage(0);
              setQuery((current) => ({ ...current, tab: key }));
              setDraft((current) => ({ ...current, tab: key }));
            }}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${query.tab === key ? "border-brand text-brand" : "border-transparent text-slate-500"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        onSubmit={applyFilters}
        className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4 xl:grid-cols-6"
      >
        <label className="relative md:col-span-2">
          <span className="sr-only">Pesquisar movimentações</span>
          <Search
            className="absolute left-3 top-2.5 text-slate-400"
            size={17}
          />
          <input
            value={draft.search}
            onChange={(event) =>
              setDraft({ ...draft, search: event.target.value })
            }
            placeholder="Descrição, contato ou documento"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3"
          />
        </label>
        <select
          aria-label="Situação"
          value={draft.status}
          onChange={(event) =>
            setDraft({ ...draft, status: event.target.value })
          }
          className="rounded-lg border border-slate-300 px-3"
        >
          <option value="ALL">Todas as situações</option>
          <option value="DRAFT">Rascunho</option>
          <option value="PENDING">Pendente</option>
          <option value="PARTIAL">Parcial</option>
          <option value="OVERDUE">Atrasado</option>
          <option value="SETTLED">Liquidado</option>
          <option value="CANCELED">Cancelado</option>
          <option value="REVERSED">Estornado</option>
        </select>
        <input
          aria-label="Período inicial"
          type="date"
          value={draft.startDate ?? ""}
          onChange={(event) =>
            setDraft({ ...draft, startDate: event.target.value || null })
          }
          className="rounded-lg border border-slate-300 px-3"
        />
        <input
          aria-label="Período final"
          type="date"
          value={draft.endDate ?? ""}
          onChange={(event) =>
            setDraft({ ...draft, endDate: event.target.value || null })
          }
          className="rounded-lg border border-slate-300 px-3"
        />
        <select
          aria-label="Categoria"
          value={draft.categoryId ?? ""}
          onChange={(event) =>
            setDraft({ ...draft, categoryId: event.target.value || null })
          }
          className="rounded-lg border border-slate-300 px-3"
        >
          <option value="">Todas as categorias</option>
          {options?.categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Conta financeira"
          value={draft.financialAccountId ?? ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              financialAccountId: event.target.value || null,
            })
          }
          className="rounded-lg border border-slate-300 px-3"
        >
          <option value="">Todas as contas</option>
          {options?.accounts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Forma de pagamento"
          value={draft.paymentMethodId ?? ""}
          onChange={(event) =>
            setDraft({ ...draft, paymentMethodId: event.target.value || null })
          }
          className="rounded-lg border border-slate-300 px-3"
        >
          <option value="">Todas as formas</option>
          {options?.paymentMethods.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Contato"
          value={draft.contactId ?? ""}
          onChange={(event) =>
            setDraft({ ...draft, contactId: event.target.value || null })
          }
          className="rounded-lg border border-slate-300 px-3"
        >
          <option value="">Todos os contatos</option>
          {options?.contacts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Valor mínimo"
          inputMode="decimal"
          placeholder="Valor mínimo"
          value={minimum}
          onChange={(event) => setMinimum(event.target.value)}
          className="rounded-lg border border-slate-300 px-3"
        />
        <input
          aria-label="Valor máximo"
          inputMode="decimal"
          placeholder="Valor máximo"
          value={maximum}
          onChange={(event) => setMaximum(event.target.value)}
          className="rounded-lg border border-slate-300 px-3"
        />
        <select
          aria-label="Origem"
          value={draft.originType}
          onChange={(event) =>
            setDraft({ ...draft, originType: event.target.value })
          }
          className="rounded-lg border border-slate-300 px-3"
        >
          <option value="">Todas as origens</option>
          <option value="MANUAL">Manual</option>
          <option value="SALE">Venda</option>
          <option value="REVERSAL">Estorno</option>
        </select>
        <button className="rounded-lg bg-ink px-4 py-2 font-semibold text-white">
          Aplicar filtros
        </button>
      </form>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-surface">
        {loading ? (
          <p className="p-6 text-slate-500">Carregando movimentações…</p>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nenhuma movimentação encontrada"
              text="Registre a primeira movimentação ou ajuste os filtros."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-3">Data</th>
                  <th className="px-3 py-3">Descrição</th>
                  <th className="px-3 py-3">Contato</th>
                  <th className="px-3 py-3">Categoria</th>
                  <th className="px-3 py-3">Conta</th>
                  <th className="px-3 py-3 text-right">Valor</th>
                  <th className="px-3 py-3">Situação</th>
                  <th className="px-3 py-3">Vencimento</th>
                  <th className="px-3 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3">{formatDate(entry.issueDate)}</td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => setDetailId(entry.id)}
                        className="font-semibold text-brand hover:underline"
                      >
                        {entry.description}
                      </button>
                      <p className="text-xs text-slate-500">
                        {entryTypeLabels[entry.entryType] ?? entry.entryType}
                        {entry.installmentCount > 1
                          ? ` · ${installmentLabel(entry)}`
                          : ""}
                        {entry.isRecurring ? " · Recorrente" : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3">{entry.contactName ?? "—"}</td>
                    <td className="px-3 py-3">{entry.categoryName ?? "—"}</td>
                    <td className="px-3 py-3">
                      {entry.financialAccountName ?? "—"}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-semibold ${entry.direction === "IN" ? "text-positive" : "text-critical"}`}
                    >
                      {entry.direction === "IN" ? "+" : "−"}
                      {money.format(entry.grossAmountCents / 100)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={entry.displayStatus} />
                    </td>
                    <td className="px-3 py-3">{formatDate(entry.dueDate)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-0.5">
                        <Action
                          label="Visualizar e histórico"
                          icon={Eye}
                          onClick={() => setDetailId(entry.id)}
                        />
                        {["DRAFT", "PENDING"].includes(entry.persistedStatus) &&
                          entry.settledPrincipalCents === 0 &&
                          entry.originType !== "SALE" &&
                          !entry.reversedAt && (
                            <Action
                              label="Editar"
                              icon={Pencil}
                              onClick={() => edit(entry)}
                            />
                          )}
                        {entry.persistedStatus === "PENDING" &&
                          entry.remainingAmountCents > 0 &&
                          !entry.entryType.startsWith("TRANSFER_") && (
                            <Action
                              label="Liquidar"
                              icon={WalletCards}
                              onClick={() => setSettling({ entry })}
                            />
                          )}
                        {entry.persistedStatus === "PENDING" &&
                          !entry.reversedAt && (
                            <Action
                              label="Reagendar"
                              icon={CalendarClock}
                              onClick={() => setRescheduling(entry)}
                            />
                          )}
                        {!["TRANSFER_IN", "TRANSFER_OUT", "REVERSAL"].includes(
                          entry.entryType,
                        ) &&
                          entry.originType !== "SALE" && (
                            <Action
                              label="Duplicar"
                              icon={Copy}
                              onClick={() => duplicate(entry)}
                            />
                          )}
                        {["DRAFT", "PENDING"].includes(entry.persistedStatus) &&
                          entry.settledPrincipalCents === 0 &&
                          entry.originType !== "SALE" && (
                            <Action
                              label="Cancelar"
                              icon={XCircle}
                              onClick={() => setCanceling(entry)}
                              critical
                            />
                          )}
                        {entry.settledPrincipalCents > 0 &&
                          !entry.reversedAt && (
                            <Action
                              label="Estornar"
                              icon={RotateCcw}
                              onClick={() => setReversing(entry)}
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
        <span>{total} movimentação(ões)</span>
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
        <EntryForm
          options={options}
          initial={form}
          onClose={() => setForm(null)}
          onSaved={() =>
            void saved(
              form.id ? "Movimentação atualizada." : "Movimentação criada.",
            )
          }
        />
      )}
      {options && transfer && (
        <TransferForm
          options={options}
          onClose={() => setTransfer(false)}
          onSaved={() =>
            void saved("Transferência registrada nas duas contas.")
          }
        />
      )}
      {recurrences && (
        <RecurrencesModal
          focusId={recurrences === "ALL" ? null : recurrences}
          onClose={() => setRecurrences(null)}
        />
      )}
      {detailId && (
        <EntryDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(entry) => {
            setDetailId(null);
            edit(entry);
          }}
        />
      )}
      {options && settling && (
        <SettlementModal
          entry={settling.entry}
          options={options}
          partial={settling.partial}
          onClose={() => setSettling(null)}
          onSaved={() => {
            setSettling(null);
            notify("Liquidação registrada.");
            void refresh();
          }}
        />
      )}
      {canceling && (
        <ReasonModal
          title="Cancelar movimentação pendente"
          onClose={() => setCanceling(null)}
          onConfirm={async (reason) => {
            await cancelFinancialEntry(canceling.id, reason);
            setCanceling(null);
            notify("Movimentação cancelada.");
            await refresh();
          }}
        />
      )}
      {reversing && (
        <ReasonModal
          title="Estornar movimentação liquidada"
          requireDate
          onClose={() => setReversing(null)}
          onConfirm={async (reason, date) => {
            await reverseFinancialEntry(reversing.id, date, reason);
            setReversing(null);
            notify("Estorno criado e saldo recomposto.");
            await refresh();
          }}
        />
      )}
      {rescheduling && (
        <RescheduleModal
          currentDate={rescheduling.dueDate}
          onClose={() => setRescheduling(null)}
          onConfirm={async (date) => {
            await rescheduleFinancialEntry(rescheduling.id, date);
            setRescheduling(null);
            notify("Vencimento reagendado.");
            await refresh();
          }}
        />
      )}
    </section>
  );
}

function Action({
  label,
  icon: Icon,
  onClick,
  critical = false,
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

function TransferForm({
  options,
  onClose,
  onSaved,
}: {
  options: FinanceOptions;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial: TransferInput = {
    description: "Transferência entre contas",
    amountCents: 0,
    date: isoToday(),
    sourceAccountId: options.defaultFinancialAccountId ?? "",
    destinationAccountId: "",
    paymentMethodId:
      options.paymentMethods.find((item) => item.detail === "TRANSFER")?.id ??
      options.defaultPaymentMethodId ??
      "",
    documentReference: null,
    notes: null,
  };
  const [value, setValue] = useState(initial);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cents = parseMoney(amount);
    if (cents === null || Number.isNaN(cents) || cents <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createFinancialTransfer({ ...value, amountCents: cents });
      onSaved();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Transferência entre contas" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <Feedback error={error} />
        <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          A operação cria uma saída e uma entrada vinculadas. Ela altera os
          saldos das contas, mas não o faturamento nem o resultado.
        </p>
        <Field label="Descrição" required>
          <input
            value={value.description}
            onChange={(event) =>
              setValue({ ...value, description: event.target.value })
            }
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor (R$)" required>
            <input
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="Data" required>
            <input
              type="date"
              value={value.date}
              onChange={(event) =>
                setValue({ ...value, date: event.target.value })
              }
            />
          </Field>
          <Field label="Conta de origem" required>
            <select
              value={value.sourceAccountId}
              onChange={(event) =>
                setValue({ ...value, sourceAccountId: event.target.value })
              }
            >
              <option value="">Selecione</option>
              {options.accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ·{" "}
                  {money.format((item.currentBalanceCents ?? 0) / 100)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Conta de destino" required>
            <select
              value={value.destinationAccountId}
              onChange={(event) =>
                setValue({ ...value, destinationAccountId: event.target.value })
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
          <Field label="Forma de pagamento" required>
            <select
              value={value.paymentMethodId}
              onChange={(event) =>
                setValue({ ...value, paymentMethodId: event.target.value })
              }
            >
              {options.paymentMethods.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Referência documental">
            <input
              value={value.documentReference ?? ""}
              onChange={(event) =>
                setValue({
                  ...value,
                  documentReference: event.target.value || null,
                })
              }
            />
          </Field>
        </div>
        <Field label="Observações">
          <textarea
            rows={3}
            value={value.notes ?? ""}
            onChange={(event) =>
              setValue({ ...value, notes: event.target.value || null })
            }
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold"
          >
            Cancelar
          </button>
          <button
            disabled={
              busy ||
              !value.sourceAccountId ||
              !value.destinationAccountId ||
              !value.paymentMethodId
            }
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Transferindo…" : "Confirmar transferência"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RecurrencesModal({
  focusId,
  onClose,
}: {
  focusId: string | null;
  onClose: () => void;
}) {
  const [items, setItems] = useState<RecurrenceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listRecurrences());
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const toggle = async (item: RecurrenceSummary) => {
    if (
      !window.confirm(
        `${item.isActive ? "Pausar" : "Reativar"} ${item.description}?`,
      )
    )
      return;
    try {
      await setRecurrenceActive(item.id, !item.isActive);
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  };
  return (
    <Modal title="Recorrências" onClose={onClose} wide>
      <Feedback error={error} />
      {loading ? (
        <p className="text-slate-500">Carregando recorrências…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhuma recorrência"
          text="Marque “Repetir automaticamente” ao criar uma movimentação."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Descrição</th>
                <th className="p-3">Frequência</th>
                <th className="p-3">Próxima geração</th>
                <th className="p-3">Ocorrências</th>
                <th className="p-3">Situação</th>
                <th className="p-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {[...items]
                .sort((left, right) =>
                  left.id === focusId ? -1 : right.id === focusId ? 1 : 0,
                )
                .map((item) => (
                <tr
                  key={item.id}
                  className={`border-t ${item.id === focusId ? "bg-blue-50 ring-1 ring-inset ring-brand" : ""}`}
                >
                  <td className="p-3 font-medium">{item.description}</td>
                  <td className="p-3">
                    A cada {item.intervalValue} período(s) ·{" "}
                    {frequencyLabels[item.frequency]}
                  </td>
                  <td className="p-3">{formatDate(item.nextGenerationDate)}</td>
                  <td className="p-3">
                    {item.generatedOccurrences}
                    {item.maximumOccurrences
                      ? `/${item.maximumOccurrences}`
                      : ""}
                  </td>
                  <td className="p-3">
                    {item.isActive ? "Ativa" : "Pausada/concluída"}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => void toggle(item)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                    >
                      {item.isActive ? "Pausar" : "Reativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
