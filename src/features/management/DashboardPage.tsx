import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleAlert,
  Goal,
  Plus,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { money } from "../../domain/display";
import {
  greeting,
  percentageChange,
  progressWidth,
} from "../../domain/management";
import {
  getManagementDashboard,
  type DashboardIndicator,
  type DashboardListItem,
  type DashboardPoint,
  type DashboardQuery,
  type DashboardResult,
} from "../../infrastructure/management";
import { EmptyState, Feedback } from "../masters/components";

const statusLabels: Record<string, string> = {
  PENDING: "Pendente",
  PARTIAL: "Parcial",
  OVERDUE: "Atrasada",
  SETTLED: "Liquidada",
  CANCELED: "Cancelada",
  REVERSED: "Estornada",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
      {statusLabels[status] ?? status}
    </span>
  );
}

function currentMonth(): DashboardQuery {
  const today = new Date();
  const endDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  return {
    startDate: `${endDate.slice(0, 7)}-01`,
    endDate,
    grouping: "DAILY",
  };
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function DashboardPage() {
  const [query, setQuery] = useState<DashboardQuery>(currentMonth);
  const [result, setResult] = useState<DashboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await getManagementDashboard(query));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="mx-auto max-w-[1500px] py-8">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-sm font-semibold text-brand">
            {greeting(new Date().getHours())}
            {result ? `, ${result.userName.split(" ")[0]}` : ""}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
            {result?.businessName ?? "Caixa no Controle"}
          </h1>
          <p className="mt-1 text-slate-600">
            Gestão financeira reconciliada em um único lugar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickAction
            label="Nova receita"
            icon={ArrowDownToLine}
            onClick={() => navigate("/movimentacoes?new=REVENUE")}
          />
          <QuickAction
            label="Nova despesa"
            icon={ArrowUpFromLine}
            onClick={() => navigate("/movimentacoes?new=EXPENSE")}
          />
          <QuickAction
            label="Nova venda"
            icon={ReceiptText}
            primary
            onClick={() => navigate("/vendas?new=1")}
          />
        </div>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void refresh();
        }}
        className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-surface sm:grid-cols-4"
      >
        <label className="text-sm font-medium text-slate-800">
          Período inicial
          <input
            type="date"
            value={query.startDate}
            onChange={(event) =>
              setQuery({ ...query, startDate: event.target.value })
            }
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-slate-800">
          Período final
          <input
            type="date"
            value={query.endDate}
            onChange={(event) =>
              setQuery({ ...query, endDate: event.target.value })
            }
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-slate-800">
          Agrupamento dos gráficos
          <select
            value={query.grouping}
            onChange={(event) =>
              setQuery({
                ...query,
                grouping: event.target.value as DashboardQuery["grouping"],
              })
            }
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="DAILY">Diário</option>
            <option value="MONTHLY">Mensal</option>
          </select>
        </label>
        <button className="self-end rounded-lg bg-ink px-4 py-2.5 font-semibold text-white">
          Atualizar visão
        </button>
      </form>
      <div className="mt-4">
        <Feedback error={error} />
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : (
        result && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Indicator
                label="Saldo total disponível"
                explanation="Saldo das contas na data final, considerando apenas liquidações."
                value={result.availableBalance}
                icon={WalletCards}
              />
              <Indicator
                label="Entradas recebidas"
                explanation="Entradas efetivamente liquidadas no período selecionado."
                value={result.receivedInflow}
                icon={TrendingUp}
                positive
              />
              <Indicator
                label="Saídas pagas"
                explanation="Saídas efetivamente liquidadas no período selecionado."
                value={result.paidOutflow}
                icon={TrendingDown}
                negative
              />
              <Indicator
                label="Resultado do período"
                explanation="Receitas menos despesas no regime de caixa; aportes e transferências ficam fora."
                value={result.periodResult}
                icon={result.periodResult.currentCents >= 0 ? TrendingUp : TrendingDown}
                positive={result.periodResult.currentCents >= 0}
                negative={result.periodResult.currentCents < 0}
              />
              <Indicator
                label="Total a receber"
                explanation="Saldo de receitas pendentes, inclusive parcelas parcialmente recebidas."
                value={result.totalReceivable}
                icon={ArrowDownToLine}
                onClick={() => navigate("/receber")}
              />
              <Indicator
                label="Total a pagar"
                explanation="Saldo de despesas pendentes, inclusive parcelas parcialmente pagas."
                value={result.totalPayable}
                icon={ArrowUpFromLine}
                onClick={() => navigate("/pagar")}
              />
              <Indicator
                label="Total vencido"
                explanation="Soma de contas a receber e a pagar vencidas e ainda pendentes."
                value={result.totalOverdue}
                icon={CircleAlert}
                negative={result.totalOverdue.currentCents > 0}
              />
              <GoalIndicator result={result} />
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <ChartCard
                title="Entradas versus saídas"
                description="Valores efetivamente movimentados no período."
              >
                <CashBars points={result.points} />
              </ChartCard>
              <ChartCard
                title="Evolução do saldo"
                description="Saldo acumulado após as liquidações de cada intervalo."
              >
                <BalanceLine points={result.points} />
              </ChartCard>
              <ChartCard
                title="Despesas por categoria"
                description="Participação das despesas pagas, com valor e percentual."
              >
                <ExpenseBars categories={result.expenseCategories} />
              </ChartCard>
              <ChartCard
                title="Meta mensal de faturamento"
                description="Realizado, restante e ritmo necessário estão detalhados em Metas."
              >
                <GoalProgress result={result} />
              </ChartCard>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
              <QuickList title="Próximas contas a pagar" items={result.upcomingPayables} />
              <QuickList title="Próximos recebimentos" items={result.upcomingReceivables} />
              <QuickList title="Contas atrasadas" items={result.overdueAccounts} />
              <QuickList title="Maiores despesas" items={result.largestExpenses} />
              <QuickList title="Últimas movimentações" items={result.latestMovements} />
            </div>
          </>
        )
      )}
    </section>
  );
}

function QuickAction({
  label,
  icon: Icon,
  onClick,
  primary,
}: {
  label: string;
  icon: typeof Plus;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 font-semibold ${primary ? "bg-brand text-white" : "border border-slate-300 bg-white text-ink"}`}
    >
      <Icon size={17} />
      {label}
    </button>
  );
}

function Indicator({
  label,
  explanation,
  value,
  icon: Icon,
  positive,
  negative,
  onClick,
}: {
  label: string;
  explanation: string;
  value: DashboardIndicator;
  icon: typeof WalletCards;
  positive?: boolean;
  negative?: boolean;
  onClick?: () => void;
}) {
  const comparison = percentageChange(value.currentCents, value.previousCents);
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p
            className={`mt-1 text-xl font-bold ${negative ? "text-critical" : positive ? "text-positive" : "text-ink"}`}
          >
            {money.format(value.currentCents / 100)}
          </p>
        </div>
        <Icon
          size={21}
          className={negative ? "text-critical" : positive ? "text-positive" : "text-brand"}
        />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {value.currentCents === 0
          ? "Nenhum valor no recorte atual"
          : comparison === null
          ? value.previousCents === null
            ? "Sem comparação histórica confiável"
            : "Período anterior sem base comparável"
          : `${comparison >= 0 ? "+" : ""}${(comparison / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% ante o período anterior`}
      </p>
    </>
  );
  const classes =
    "rounded-xl border border-slate-200 bg-white p-4 text-left shadow-surface";
  return onClick ? (
    <button title={explanation} onClick={onClick} className={`${classes} hover:border-brand`}>
      {content}
    </button>
  ) : (
    <article title={explanation} className={classes}>
      {content}
    </article>
  );
}

function GoalIndicator({ result }: { result: DashboardResult }) {
  const percentage = result.goalProgressBasisPoints;
  return (
    <button
      title="Percentual realizado da meta mensal de faturamento do mês da data final."
      onClick={() => navigate(`/metas?month=${result.endDate.slice(0, 7)}`)}
      className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-surface hover:border-brand"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Progresso da meta</p>
          <p className="mt-1 text-xl font-bold text-ink">
            {percentage === null
              ? "Não definida"
              : `${(percentage / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
          </p>
        </div>
        <Goal size={21} className="text-brand" />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${progressWidth(percentage)}%` }}
        />
      </div>
    </button>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-surface">
      <h2 className="font-bold text-ink">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <div className="mt-5">{children}</div>
    </article>
  );
}

function pointLabel(point: DashboardPoint) {
  return point.key.length === 7
    ? new Date(`${point.key}-01T00:00:00`).toLocaleDateString("pt-BR", {
        month: "short",
        year: "2-digit",
      })
    : new Date(`${point.key}T00:00:00`).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
}

function CashBars({ points }: { points: DashboardPoint[] }) {
  const visible = points.filter(
    (point) => point.inflowCents !== 0 || point.outflowCents !== 0,
  );
  const source = points;
  const maximum = Math.max(
    1,
    ...source.flatMap((point) => [point.inflowCents, point.outflowCents]),
  );
  if (visible.length === 0)
    return <EmptyState title="Sem movimentação" text="Não há valores no período." />;
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1">
          <ArrowDownToLine size={14} aria-hidden="true" /> Entradas
        </span>
        <span className="inline-flex items-center gap-1">
          <ArrowUpFromLine size={14} aria-hidden="true" /> Saídas
        </span>
      </div>
      <div
        role="region"
        aria-label="Gráfico de entradas e saídas; use as setas para percorrer"
        tabIndex={0}
        className="overflow-x-auto pb-2"
      >
        <div className="flex h-48 min-w-max items-end gap-2 border-b border-slate-200 px-2">
          {source.map((point) => (
            <div key={point.key} className="flex w-12 shrink-0 flex-col items-center">
              <div className="flex h-40 items-end gap-1">
                <div
                  title={`${pointLabel(point)} — Entradas: ${money.format(point.inflowCents / 100)}`}
                  className="w-4 rounded-t bg-positive"
                  style={{ height: `${Math.max(2, (point.inflowCents / maximum) * 100)}%` }}
                />
                <div
                  title={`${pointLabel(point)} — Saídas: ${money.format(point.outflowCents / 100)}`}
                  className="w-4 rounded-t border-2 border-critical bg-red-50"
                  style={{ height: `${Math.max(2, (point.outflowCents / maximum) * 100)}%` }}
                />
              </div>
              <span className="mt-1 text-[10px] text-slate-500">{pointLabel(point)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BalanceLine({ points }: { points: DashboardPoint[] }) {
  const data = points;
  if (data.length === 0)
    return <EmptyState title="Sem saldo" text="Não há dias no período." />;
  const values = data.map((point) => point.closingBalanceCents);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(1, maximum - minimum);
  const width = Math.max(600, (data.length - 1) * 42 + 40);
  const coords = data.map((point, index) => ({
    point,
    x: 20 + (index * (width - 40)) / Math.max(1, data.length - 1),
    y: 150 - ((point.closingBalanceCents - minimum) / range) * 120,
  }));
  return (
    <div
      role="region"
      aria-label="Evolução do saldo; use as setas para percorrer"
      tabIndex={0}
      className="overflow-x-auto"
    >
      <svg
        role="img"
        aria-label="Gráfico de linha da evolução do saldo"
        viewBox={`0 0 ${width} 180`}
        className="h-48 min-w-[600px]"
      >
        <line x1="20" y1="150" x2={width - 20} y2="150" stroke="#cbd5e1" />
        <polyline
          points={coords.map(({ x, y }) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="#2563eb"
          strokeWidth="3"
        />
        {coords.map(({ point, x, y }) => (
          <circle key={point.key} cx={x} cy={y} r="4" fill="#fff" stroke="#2563eb" strokeWidth="3">
            <title>{`${pointLabel(point)} — ${money.format(point.closingBalanceCents / 100)}`}</title>
          </circle>
        ))}
        <text x="20" y="174" fontSize="11" fill="#64748b">
          {pointLabel(data[0])}
        </text>
        <text x={width - 70} y="174" fontSize="11" fill="#64748b">
          {pointLabel(data[data.length - 1])}
        </text>
      </svg>
    </div>
  );
}

function ExpenseBars({ categories }: { categories: DashboardResult["expenseCategories"] }) {
  if (categories.length === 0)
    return <EmptyState title="Sem despesas pagas" text="Não há despesas liquidadas no período." />;
  return (
    <div className="space-y-4">
      {categories.map((category, index) => (
        <div key={category.categoryId ?? category.name}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{index + 1}. {category.name}</span>
            <span>{money.format(category.amountCents / 100)} · {(category.percentageBasisPoints / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-critical" style={{ width: `${progressWidth(category.percentageBasisPoints)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function GoalProgress({ result }: { result: DashboardResult }) {
  if (result.goalTargetCents === null)
    return (
      <EmptyState
        title="Meta ainda não definida"
        text="Abra Metas para definir o objetivo deste mês."
      />
    );
  const remaining = Math.max(0, result.goalTargetCents - result.goalActualCents);
  return (
    <button
      onClick={() => navigate(`/metas?month=${result.endDate.slice(0, 7)}`)}
      className="w-full rounded-lg border border-slate-200 p-4 text-left hover:border-brand"
    >
      <div className="flex justify-between gap-4 text-sm">
        <span>Realizado: <strong>{money.format(result.goalActualCents / 100)}</strong></span>
        <span>Restante: <strong>{money.format(remaining / 100)}</strong></span>
      </div>
      <div className="mt-4 h-4 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand" style={{ width: `${progressWidth(result.goalProgressBasisPoints)}%` }} />
      </div>
      <p className="mt-2 text-right text-sm font-bold text-brand">
        {((result.goalProgressBasisPoints ?? 0) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Média necessária por dia útil: <strong>{money.format((result.goalDailyBusinessCents ?? 0) / 100)}</strong>
      </p>
    </button>
  );
}

function itemPath(item: DashboardListItem) {
  if (item.listKind === "RECEIVABLE")
    return `/receber?entry=${encodeURIComponent(item.id)}`;
  if (item.listKind === "PAYABLE")
    return `/pagar?entry=${encodeURIComponent(item.id)}`;
  return `/movimentacoes?entry=${encodeURIComponent(item.id)}`;
}

function QuickList({ title, items }: { title: string; items: DashboardListItem[] }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-surface">
      <h2 className="font-bold text-ink">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Nenhum item neste período.</p>
      ) : (
        <div className="mt-3 divide-y divide-slate-100">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(itemPath(item))}
              className="flex w-full items-center justify-between gap-3 py-3 text-left hover:text-brand"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.title}</p>
                <p className="text-xs text-slate-500">
                  {item.subtitle ?? "Sem contato"} · {formatDate(item.dueDate ?? item.date)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold">{money.format(item.amountCents / 100)}</p>
                <StatusChip status={item.status} />
              </div>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-label="Carregando dashboard" className="mt-5 space-y-5 animate-pulse">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-28 rounded-xl bg-slate-200" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="h-72 rounded-xl bg-slate-200" />
        <div className="h-72 rounded-xl bg-slate-200" />
      </div>
    </div>
  );
}
