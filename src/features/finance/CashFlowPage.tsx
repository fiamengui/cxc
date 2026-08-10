import { useCallback, useEffect, useState } from "react";
import { TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import { money } from "../../domain/display";
import {
  getFinanceOptions,
  getFinancialCashFlow,
  type CashFlowQuery,
  type CashFlowResult,
  type FinanceOptions,
} from "../../infrastructure/finance";
import { EmptyState, Feedback } from "../masters/components";
import { formatDate, isoToday } from "./shared";

function firstDayOfMonth() {
  return `${isoToday().slice(0, 7)}-01`;
}

export function CashFlowPage() {
  const [options, setOptions] = useState<FinanceOptions | null>(null);
  const [query, setQuery] = useState<CashFlowQuery>({
    startDate: firstDayOfMonth(),
    endDate: isoToday(),
    financialAccountId: null,
    categoryId: null,
    regime: "CASH",
    status: "ALL",
    projectionUntil: null,
    includePendingProjection: false,
  });
  const [result, setResult] = useState<CashFlowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await getFinancialCashFlow(query));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    void getFinanceOptions()
      .then((value) => {
        setOptions(value);
        setQuery((current) => ({
          ...current,
          regime: value.defaultViewRegime,
        }));
      })
      .catch((reason) => setError(String(reason)));
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <section className="mx-auto max-w-7xl py-8">
      <header>
        <h1 className="text-2xl font-bold text-ink">Fluxo de caixa</h1>
        <p className="mt-1 text-slate-600">
          Saldo realizado por conta e projeção claramente separada do dinheiro
          disponível.
        </p>
      </header>
      <div className="mt-5">
        <Feedback error={error} />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void refresh();
        }}
        className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4"
      >
        <label className="text-sm font-medium">
          Início
          <input
            type="date"
            value={query.startDate}
            onChange={(event) =>
              setQuery({ ...query, startDate: event.target.value })
            }
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          Fim
          <input
            type="date"
            value={query.endDate}
            onChange={(event) =>
              setQuery({ ...query, endDate: event.target.value })
            }
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          Conta
          <select
            value={query.financialAccountId ?? ""}
            onChange={(event) =>
              setQuery({
                ...query,
                financialAccountId: event.target.value || null,
              })
            }
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">Todas as contas</option>
            {options?.accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Categoria
          <select
            value={query.categoryId ?? ""}
            onChange={(event) =>
              setQuery({ ...query, categoryId: event.target.value || null })
            }
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">Todas as categorias</option>
            {options?.categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Regime
          <select
            value={query.regime}
            onChange={(event) =>
              setQuery({
                ...query,
                regime: event.target.value as CashFlowQuery["regime"],
              })
            }
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="CASH">Caixa</option>
            <option value="ACCRUAL">Competência</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Situação
          <select
            value={query.status}
            onChange={(event) =>
              setQuery({ ...query, status: event.target.value })
            }
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="ALL">Todas</option>
            <option value="SETTLED">Liquidadas</option>
            <option value="PENDING">Pendentes com baixa parcial</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end rounded-lg bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900">
          <input
            type="checkbox"
            checked={query.includePendingProjection}
            onChange={(event) =>
              setQuery({
                ...query,
                includePendingProjection: event.target.checked,
                projectionUntil: event.target.checked
                  ? (query.projectionUntil ?? query.endDate)
                  : null,
              })
            }
          />
          Incluir pendências na projeção
        </label>
        {query.includePendingProjection && (
          <label className="text-sm font-medium">
            Projetar até
            <input
              type="date"
              value={query.projectionUntil ?? ""}
              onChange={(event) =>
                setQuery({
                  ...query,
                  projectionUntil: event.target.value || null,
                })
              }
              className="mt-1 block w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2"
            />
          </label>
        )}
        <button className="rounded-lg bg-ink px-4 py-2 font-semibold text-white md:col-start-4">
          Atualizar fluxo
        </button>
      </form>
      {loading ? (
        <p className="mt-6 text-slate-500">Calculando fluxo…</p>
      ) : (
        result && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Card
                label="Saldo inicial"
                value={result.openingBalanceCents}
                icon={WalletCards}
              />
              <Card
                label="Entradas"
                value={result.inflowCents}
                icon={TrendingUp}
                positive
              />
              <Card
                label="Saídas"
                value={result.outflowCents}
                icon={TrendingDown}
                negative
              />
              <Card
                label={`Resultado (${result.regime === "CASH" ? "caixa" : "competência"})`}
                value={result.resultCents}
                icon={WalletCards}
                positive={result.resultCents >= 0}
                negative={result.resultCents < 0}
              />
              <Card
                label="Saldo final realizado"
                value={result.closingBalanceCents}
                icon={WalletCards}
              />
              <Card
                label="Saldo projetado"
                value={result.projectedBalanceCents}
                icon={WalletCards}
                projected
              />
            </div>
            {query.includePendingProjection && (
              <div className="mt-4 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
                <strong>Previsão, não saldo real:</strong> considera{" "}
                {money.format(result.projectedInflowCents / 100)} em entradas
                pendentes e {money.format(result.projectedOutflowCents / 100)}{" "}
                em saídas pendentes até {formatDate(query.projectionUntil)}.
              </div>
            )}
            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-surface">
              {result.days.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    title="Sem dias no período"
                    text="Revise as datas selecionadas."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3 text-right">
                          Saldo inicial do dia
                        </th>
                        <th className="px-4 py-3 text-right">Entradas</th>
                        <th className="px-4 py-3 text-right">Saídas</th>
                        <th className="px-4 py-3 text-right">
                          Resultado diário
                        </th>
                        <th className="px-4 py-3 text-right">Saldo final</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.days.map((day) => (
                        <tr key={day.date}>
                          <td className="px-4 py-3">{formatDate(day.date)}</td>
                          <td className="px-4 py-3 text-right">
                            {money.format(day.openingBalanceCents / 100)}
                          </td>
                          <td className="px-4 py-3 text-right text-positive">
                            {money.format(day.inflowCents / 100)}
                          </td>
                          <td className="px-4 py-3 text-right text-critical">
                            {money.format(day.outflowCents / 100)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right ${day.dailyResultCents >= 0 ? "text-positive" : "text-critical"}`}
                          >
                            {money.format(day.dailyResultCents / 100)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {money.format(day.closingBalanceCents / 100)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )
      )}
    </section>
  );
}

function Card({
  label,
  value,
  icon: Icon,
  positive,
  negative,
  projected,
}: {
  label: string;
  value: number;
  icon: typeof WalletCards;
  positive?: boolean;
  negative?: boolean;
  projected?: boolean;
}) {
  return (
    <article
      className={`rounded-xl border p-4 shadow-surface ${projected ? "border-dashed border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`}
    >
      <Icon
        size={20}
        className={
          negative
            ? "text-critical"
            : positive
              ? "text-positive"
              : projected
                ? "text-amber-700"
                : "text-brand"
        }
      />
      <p className="mt-2 text-xs text-slate-500">{label}</p>
      <p
        className={`mt-1 text-lg font-bold ${negative ? "text-critical" : positive ? "text-positive" : "text-ink"}`}
      >
        {money.format(value / 100)}
      </p>
    </article>
  );
}
