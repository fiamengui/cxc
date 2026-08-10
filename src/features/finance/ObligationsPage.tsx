import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  Copy,
  Eye,
  MessageCircle,
  Pencil,
  ReceiptText,
  Search,
  UserRound,
  XCircle,
} from "lucide-react";
import { money } from "../../domain/display";
import {
  cancelFinancialEntry,
  getFinanceOptions,
  listObligations,
  rescheduleFinancialEntry,
  type EntryInput,
  type EntrySummary,
  type FinanceOptions,
  type ObligationIndicators,
} from "../../infrastructure/finance";
import { EmptyState, Feedback, Field, Modal } from "../masters/components";
import {
  EntryDetailModal,
  EntryForm,
  entryToInput,
  formatDate,
  installmentLabel,
  ReasonModal,
  RescheduleModal,
  SettlementModal,
  StatusBadge,
} from "./shared";

const pageSize = 25;
const emptyIndicators: ObligationIndicators = {
  totalPendingCents: 0,
  overdueCents: 0,
  dueTodayCents: 0,
  nextSevenDaysCents: 0,
  settledThisMonthCents: 0,
};

export function ObligationsPage({ kind }: { kind: "RECEIVABLE" | "PAYABLE" }) {
  const receiving = kind === "RECEIVABLE";
  const [options, setOptions] = useState<FinanceOptions | null>(null);
  const [items, setItems] = useState<EntrySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [indicators, setIndicators] = useState(emptyIndicators);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [settling, setSettling] = useState<{
    entry: EntrySummary;
    partial: boolean;
  } | null>(null);
  const [form, setForm] = useState<EntryInput | null>(null);
  const [detail, setDetail] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("entry"),
  );
  const [canceling, setCanceling] = useState<EntrySummary | null>(null);
  const [rescheduling, setRescheduling] = useState<EntrySummary | null>(null);
  const [charging, setCharging] = useState<EntrySummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listObligations({
        kind,
        status,
        search,
        startDate,
        endDate,
        limit: pageSize,
        offset: page * pageSize,
      });
      setItems(result.items);
      setTotal(result.total);
      setIndicators(result.indicators);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }, [kind, status, search, startDate, endDate, page]);
  useEffect(() => {
    void getFinanceOptions()
      .then(setOptions)
      .catch((reason) => setError(String(reason)));
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const notify = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(null), 4000);
  };
  const navigate = (path: string) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  return (
    <section className="mx-auto max-w-[1450px] py-8">
      <header>
        <h1 className="text-2xl font-bold text-ink">
          {receiving ? "Contas a receber" : "Contas a pagar"}
        </h1>
        <p className="mt-1 text-slate-600">
          {receiving
            ? "Acompanhe recebimentos, atrasos e baixas parciais."
            : "Controle compromissos, vencimentos e pagamentos."}
        </p>
      </header>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric
          label={receiving ? "Total a receber" : "Total a pagar"}
          value={indicators.totalPendingCents}
        />
        <Metric
          label="Total vencido"
          value={indicators.overdueCents}
          critical={indicators.overdueCents > 0}
        />
        <Metric label="Vence hoje" value={indicators.dueTodayCents} />
        <Metric label="Próximos 7 dias" value={indicators.nextSevenDaysCents} />
        <Metric
          label={receiving ? "Recebido no mês" : "Pago no mês"}
          value={indicators.settledThisMonthCents}
          positive
        />
      </div>
      <div className="mt-5">
        <Feedback message={message} error={error} />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          void refresh();
        }}
        className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-5"
      >
        <label className="relative md:col-span-2">
          <span className="sr-only">Pesquisar contas</span>
          <Search
            size={17}
            className="absolute left-3 top-2.5 text-slate-400"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Contato ou descrição"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3"
          />
        </label>
        <select
          aria-label="Situação da conta"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(0);
          }}
          className="rounded-lg border border-slate-300 px-3"
        >
          <option value="ALL">Todas pendentes</option>
          <option value="OVERDUE">Atrasadas</option>
          <option value="TODAY">Vencem hoje</option>
          <option value="NEXT7">Próximos 7 dias</option>
          <option value="PARTIAL">Parcialmente liquidadas</option>
          <option value="PENDING">Pendentes no prazo</option>
        </select>
        <input
          aria-label="Vencimento inicial"
          type="date"
          value={startDate ?? ""}
          onChange={(event) => setStartDate(event.target.value || null)}
          className="rounded-lg border border-slate-300 px-3"
        />
        <input
          aria-label="Vencimento final"
          type="date"
          value={endDate ?? ""}
          onChange={(event) => setEndDate(event.target.value || null)}
          className="rounded-lg border border-slate-300 px-3"
        />
        <button className="rounded-lg bg-ink px-4 py-2 font-semibold text-white md:col-start-5">
          Pesquisar
        </button>
      </form>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-surface">
        {loading ? (
          <p className="p-6 text-slate-500">Carregando contas…</p>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={
                receiving ? "Nenhuma conta a receber" : "Nenhuma conta a pagar"
              }
              text={
                receiving
                  ? "Registre uma venda futura ou uma receita pendente para começar."
                  : "Registre uma despesa pendente para acompanhar seus próximos pagamentos."
              }
            />
            <div className="-mt-8 mb-8 flex justify-center">
              <button
                onClick={() =>
                  navigate(
                    `/movimentacoes?new=${receiving ? "REVENUE" : "EXPENSE"}`,
                  )
                }
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
              >
                {receiving ? "Nova receita" : "Nova despesa"}
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-3">
                    {receiving ? "Cliente" : "Fornecedor"}
                  </th>
                  <th className="px-3 py-3">Descrição</th>
                  {!receiving && <th className="px-3 py-3">Categoria</th>}
                  <th className="px-3 py-3">Parcela</th>
                  {receiving && <th className="px-3 py-3">Emissão</th>}
                  <th className="px-3 py-3">Vencimento</th>
                  <th className="px-3 py-3 text-right">Valor original</th>
                  <th className="px-3 py-3 text-right">Saldo pendente</th>
                  <th className="px-3 py-3 text-right">Dias em atraso</th>
                  <th className="px-3 py-3">Situação</th>
                  <th className="px-3 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3">{entry.contactName ?? "—"}</td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => setDetail(entry.id)}
                        className="font-semibold text-brand hover:underline"
                      >
                        {entry.description}
                      </button>
                    </td>
                    {!receiving && (
                      <td className="px-3 py-3">{entry.categoryName}</td>
                    )}
                    <td className="px-3 py-3">{installmentLabel(entry)}</td>
                    {receiving && (
                      <td className="px-3 py-3">
                        {formatDate(entry.issueDate)}
                      </td>
                    )}
                    <td className="px-3 py-3">{formatDate(entry.dueDate)}</td>
                    <td className="px-3 py-3 text-right">
                      {money.format(entry.grossAmountCents / 100)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {money.format(entry.remainingAmountCents / 100)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right ${lateDays(entry.dueDate) > 0 ? "font-semibold text-critical" : ""}`}
                    >
                      {lateDays(entry.dueDate)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={entry.displayStatus} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-0.5">
                        <Action
                          label="Visualizar"
                          icon={Eye}
                          onClick={() => setDetail(entry.id)}
                        />
                        <Action
                          label={receiving ? "Receber" : "Pagar"}
                          icon={receiving ? Copy : Copy}
                          onClick={() => setSettling({ entry, partial: false })}
                        />
                        <Action
                          label={
                            receiving
                              ? "Receber parcialmente"
                              : "Pagar parcialmente"
                          }
                          icon={CalendarClock}
                          onClick={() => setSettling({ entry, partial: true })}
                        />
                        {entry.settledPrincipalCents === 0 &&
                          entry.originType !== "SALE" && (
                            <Action
                              label="Editar"
                              icon={Pencil}
                              onClick={() => setForm(entryToInput(entry))}
                            />
                          )}
                        <Action
                          label="Reagendar"
                          icon={CalendarClock}
                          onClick={() => setRescheduling(entry)}
                        />
                        {entry.originType !== "SALE" && (
                          <Action
                            label="Duplicar"
                            icon={Copy}
                            onClick={() => setForm(entryToInput(entry, true))}
                          />
                        )}
                        {entry.settledPrincipalCents === 0 &&
                          entry.originType !== "SALE" && (
                            <Action
                              label="Cancelar"
                              icon={XCircle}
                              onClick={() => setCanceling(entry)}
                              critical
                            />
                          )}
                        {entry.contactId && (
                          <Action
                            label={`Abrir ${receiving ? "cliente" : "fornecedor"}`}
                            icon={UserRound}
                            onClick={() =>
                              navigate(
                                `/contatos?contact=${encodeURIComponent(entry.contactId!)}`,
                              )
                            }
                          />
                        )}
                        {receiving &&
                          entry.originType === "SALE" &&
                          entry.originId && (
                            <Action
                              label="Abrir venda"
                              icon={ReceiptText}
                              onClick={() =>
                                navigate(
                                  `/vendas?sale=${encodeURIComponent(entry.originId!)}`,
                                )
                              }
                            />
                          )}
                        {receiving && entry.contactName && (
                          <Action
                            label="Gerar mensagem de cobrança"
                            icon={MessageCircle}
                            onClick={() => setCharging(entry)}
                          />
                        )}
                        {!receiving && entry.recurrenceId && (
                          <Action
                            label="Ver recorrência"
                            icon={CalendarClock}
                            onClick={() =>
                              navigate(
                                `/movimentacoes?recurrence=${encodeURIComponent(entry.recurrenceId!)}`,
                              )
                            }
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
        <span>{total} conta(s)</span>
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
      {options && settling && (
        <SettlementModal
          entry={settling.entry}
          options={options}
          partial={settling.partial}
          onClose={() => setSettling(null)}
          onSaved={() => {
            setSettling(null);
            notify(
              receiving ? "Recebimento registrado." : "Pagamento registrado.",
            );
            void refresh();
          }}
        />
      )}
      {options && form && (
        <EntryForm
          options={options}
          initial={form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            notify("Movimentação salva.");
            void refresh();
          }}
        />
      )}
      {detail && (
        <EntryDetailModal
          id={detail}
          onClose={() => setDetail(null)}
          onEdit={(entry) => {
            setDetail(null);
            setForm(entryToInput(entry));
          }}
        />
      )}
      {canceling && (
        <ReasonModal
          title="Cancelar conta pendente"
          onClose={() => setCanceling(null)}
          onConfirm={async (reason) => {
            await cancelFinancialEntry(canceling.id, reason);
            setCanceling(null);
            notify("Conta cancelada.");
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
      {charging && options && (
        <ChargeMessageModal
          entry={charging}
          businessName={options.businessName}
          onClose={() => setCharging(null)}
        />
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  positive,
  critical,
}: {
  label: string;
  value: number;
  positive?: boolean;
  critical?: boolean;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-surface">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`mt-1 text-xl font-bold ${critical ? "text-critical" : positive ? "text-positive" : "text-ink"}`}
      >
        {money.format(value / 100)}
      </p>
    </article>
  );
}
function lateDays(dueDate: string | null) {
  if (!dueDate) return 0;
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(
    0,
    Math.floor((today.getTime() - due.getTime()) / 86_400_000),
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

function ChargeMessageModal({
  entry,
  businessName,
  onClose,
}: {
  entry: EntrySummary;
  businessName: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(
    `Olá, ${entry.contactName}. Tudo bem?\n\nConsta em nosso controle um pagamento de ${money.format(entry.remainingAmountCents / 100)}, com vencimento em ${formatDate(entry.dueDate)}, ainda pendente.\n\nPoderia verificar, por favor?\n\n${businessName}`,
  );
  const [message, setMessage] = useState<string | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Mensagem copiada. Nenhum envio foi feito automaticamente.");
    } catch {
      setMessage(
        "Não foi possível acessar a área de transferência. Selecione e copie o texto manualmente.",
      );
    }
  };
  return (
    <Modal title="Mensagem de cobrança" onClose={onClose}>
      <p className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
        Edite livremente. O sistema apenas copia o texto e nunca envia mensagens
        sozinho.
      </p>
      <Feedback message={message} />
      <Field label="Texto">
        <textarea
          rows={10}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 font-semibold"
        >
          Fechar
        </button>
        <button
          onClick={() => void copy()}
          className="rounded-lg bg-brand px-4 py-2 font-semibold text-white"
        >
          Copiar mensagem
        </button>
      </div>
    </Modal>
  );
}
