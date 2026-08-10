import { useCallback, useEffect, useState } from "react";
import {
  CalendarCheck,
  CircleDollarSign,
  Goal,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { centsInput, money, parseMoney } from "../../domain/display";
import { goalTone, progressWidth } from "../../domain/management";
import {
  getManagementGoal,
  saveManagementGoal,
  type GoalInput,
  type GoalMetric,
  type GoalPerformance,
} from "../../infrastructure/management";
import { Feedback, Field } from "../masters/components";

function selectedMonth() {
  const fromQuery = new URLSearchParams(window.location.search).get("month");
  if (fromQuery && /^\d{4}-\d{2}$/.test(fromQuery)) return fromQuery;
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

type GoalDraft = {
  revenue: string;
  expenses: string;
  result: string;
  sales: string;
  customers: string;
};

const emptyDraft: GoalDraft = {
  revenue: "",
  expenses: "",
  result: "",
  sales: "",
  customers: "",
};

function signedMoney(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const negative = trimmed.startsWith("-");
  const parsed = parseMoney(negative ? trimmed.slice(1) : trimmed);
  return parsed === null || Number.isNaN(parsed)
    ? Number.NaN
    : negative
      ? -parsed
      : parsed;
}

export function GoalsPage() {
  const [month, setMonth] = useState(selectedMonth);
  const [performance, setPerformance] = useState<GoalPerformance | null>(null);
  const [draft, setDraft] = useState<GoalDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const value = await getManagementGoal(month);
      setPerformance(value);
      setDraft({
        revenue: centsInput(value.revenue.target),
        expenses: centsInput(value.expenses.target),
        result: centsInput(value.result.target),
        sales: value.sales.target?.toString() ?? "",
        customers: value.newCustomers.target?.toString() ?? "",
      });
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const revenue = draft.revenue ? parseMoney(draft.revenue) : null;
    const expenses = draft.expenses ? parseMoney(draft.expenses) : null;
    const result = signedMoney(draft.result);
    const sales = draft.sales ? Number(draft.sales) : null;
    const customers = draft.customers ? Number(draft.customers) : null;
    if (
      [revenue, expenses, result].some((value) => Number.isNaN(value)) ||
      [sales, customers].some(
        (value) => value !== null && (!Number.isInteger(value) || value < 0),
      ) ||
      [revenue, expenses, result, sales, customers].every(
        (value) => value === null,
      )
    ) {
      setError("Defina ao menos uma meta e revise os valores informados.");
      return;
    }
    const input: GoalInput = {
      referenceMonth: month,
      revenueGoalCents: revenue,
      expenseLimitCents: expenses,
      resultGoalCents: result,
      salesCountGoal: sales,
      newCustomersGoal: customers,
    };
    setSaving(true);
    setError(null);
    try {
      setPerformance(await saveManagementGoal(input));
      setMessage("Metas mensais salvas e indicadores recalculados.");
      window.setTimeout(() => setMessage(null), 4_000);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto max-w-[1400px] py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Metas</h1>
          <p className="mt-1 text-slate-600">
            Defina objetivos mensais e acompanhe o ritmo necessário com dados reais.
          </p>
        </div>
        <label className="text-sm font-medium text-slate-800">
          Mês de referência
          <input
            aria-label="Mês de referência"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="ml-3 rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </header>
      <div className="mt-5">
        <Feedback message={message} error={error} />
      </div>

      {loading ? (
        <div className="mt-6 grid animate-pulse gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-56 rounded-xl bg-slate-200" />
          ))}
        </div>
      ) : (
        performance && (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <GoalCard label="Faturamento" icon={TrendingUp} metric={performance.revenue} monetary />
              <GoalCard label="Limite de despesas" icon={TrendingDown} metric={performance.expenses} monetary />
              <GoalCard label="Resultado" icon={CircleDollarSign} metric={performance.result} monetary />
              <GoalCard label="Quantidade de vendas" icon={ReceiptText} metric={performance.sales} />
              <GoalCard label="Novos clientes" icon={Users} metric={performance.newCustomers} />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
              <form
                onSubmit={(event) => void save(event)}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-surface"
              >
                <div className="flex items-center gap-2">
                  <Goal size={20} className="text-brand" />
                  <h2 className="font-bold text-ink">Configuração mensal</h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Campos não usados podem ficar vazios. Despesas representam um teto, não uma meta de crescimento.
                </p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="Meta de faturamento (R$)">
                    <input inputMode="decimal" value={draft.revenue} onChange={(event) => setDraft({ ...draft, revenue: event.target.value })} />
                  </Field>
                  <Field label="Limite de despesas (R$)">
                    <input inputMode="decimal" value={draft.expenses} onChange={(event) => setDraft({ ...draft, expenses: event.target.value })} />
                  </Field>
                  <Field label="Meta de resultado (R$)" hint="Pode ser negativa">
                    <input inputMode="decimal" value={draft.result} onChange={(event) => setDraft({ ...draft, result: event.target.value })} />
                  </Field>
                  <Field label="Quantidade de vendas">
                    <input type="number" min="0" max="100000000" value={draft.sales} onChange={(event) => setDraft({ ...draft, sales: event.target.value })} />
                  </Field>
                  <Field label="Novos clientes">
                    <input type="number" min="0" max="100000000" value={draft.customers} onChange={(event) => setDraft({ ...draft, customers: event.target.value })} />
                  </Field>
                </div>
                <div className="mt-5 flex justify-end">
                  <button disabled={saving} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50">
                    {saving ? "Salvando…" : "Salvar metas"}
                  </button>
                </div>
              </form>

              <article className="rounded-xl border border-blue-100 bg-blue-50 p-5">
                <div className="flex items-center gap-2 text-blue-950">
                  <CalendarCheck size={20} />
                  <h2 className="font-bold">Ritmo restante</h2>
                </div>
                <p className="mt-4 text-sm leading-6 text-blue-950">
                  Restam <strong>{performance.calendarDaysRemaining} dias corridos</strong> e <strong>{performance.businessDaysRemaining} dias úteis</strong> no mês selecionado.
                </p>
                <p className="mt-3 text-sm leading-6 text-blue-900">
                  As médias nos cartões usam somente o valor que ainda falta. Quando uma meta já foi atingida, o necessário passa a zero. Para despesas, a média indica quanto ainda pode ser gasto por dia sem ultrapassar o limite.
                </p>
              </article>
            </div>
          </>
        )
      )}
    </section>
  );
}

function formatMetric(value: number, monetary: boolean) {
  return monetary ? money.format(value / 100) : value.toLocaleString("pt-BR");
}

function GoalCard({
  label,
  icon: Icon,
  metric,
  monetary = false,
}: {
  label: string;
  icon: typeof Goal;
  metric: GoalMetric;
  monetary?: boolean;
}) {
  const tone = goalTone(metric.progressBasisPoints, metric.isLimit);
  const color =
    tone === "critical"
      ? "text-critical"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "good"
          ? "text-positive"
          : "text-brand";
  const comparison = metric.actual - metric.previousActual;
  const dailyLabel = metric.isLimit ? "Disponível por dia" : "Necessário por dia";
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-surface">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <Icon size={19} className={color} />
      </div>
      <p className={`mt-3 text-2xl font-bold ${color}`}>{formatMetric(metric.actual, monetary)}</p>
      <p className="text-xs text-slate-500">
        de {metric.target === null ? "meta não definida" : formatMetric(metric.target, monetary)}
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone === "critical" ? "bg-critical" : tone === "warning" ? "bg-amber-500" : tone === "good" ? "bg-positive" : "bg-brand"}`} style={{ width: `${progressWidth(metric.progressBasisPoints)}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {metric.progressBasisPoints === null ? "Sem percentual calculável" : `${(metric.progressBasisPoints / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% realizado`}
      </p>
      <p className="mt-3 text-xs text-slate-600">
        Diferença: <strong>{metric.difference === null ? "—" : formatMetric(metric.difference, monetary)}</strong>
      </p>
      <p className="text-xs text-slate-600">
        Mês anterior: <strong>{formatMetric(metric.previousActual, monetary)}</strong> ({comparison >= 0 ? "+" : ""}{formatMetric(comparison, monetary)})
      </p>
      {metric.target !== null && (
        <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
          <p>{dailyLabel} útil: <strong>{formatMetric(metric.dailyBusinessAmount ?? 0, monetary)}</strong></p>
          <p>{dailyLabel} corrido: <strong>{formatMetric(metric.dailyCalendarAmount ?? 0, monetary)}</strong></p>
        </div>
      )}
    </article>
  );
}
