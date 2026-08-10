import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  FileSpreadsheet,
  Printer,
  Search,
} from "lucide-react";
import { formatReportValue } from "../../domain/reports";
import { toUserMessage } from "../../domain/errors";
import {
  exportReportCsv,
  exportReportPdf,
  getReportOptions,
  previewReport,
  type ReportOptions,
  type ReportQuery,
  type ReportResult,
} from "../../infrastructure/reports";

type Definition = {
  id: string;
  title: string;
  description: string;
  group: string;
  cashOnly?: boolean;
  statuses?: string[];
};
const reports: Definition[] = [
  {
    id: "MONTHLY_SUMMARY",
    title: "Resumo financeiro mensal",
    description: "Visão conjunta de faturamento, despesas e caixa.",
    group: "Visão gerencial",
  },
  {
    id: "RESULT",
    title: "Resultado por período",
    description: "Receitas, despesas e resultado mês a mês.",
    group: "Visão gerencial",
  },
  {
    id: "MONTHLY_COMPARISON",
    title: "Comparativo mensal",
    description: "Evolução e variação em relação ao mês anterior.",
    group: "Visão gerencial",
  },
  {
    id: "CASH_FLOW",
    title: "Fluxo de caixa",
    description: "Saldo inicial, entradas, saídas e saldo final.",
    group: "Financeiro",
    cashOnly: true,
  },
  {
    id: "INFLOWS",
    title: "Entradas por período",
    description: "Detalhamento das entradas no período escolhido.",
    group: "Financeiro",
  },
  {
    id: "EXPENSES",
    title: "Despesas por período",
    description: "Detalhamento das despesas do negócio.",
    group: "Financeiro",
  },
  {
    id: "EXPENSES_BY_CATEGORY",
    title: "Despesas por categoria",
    description: "Concentração das despesas por categoria.",
    group: "Financeiro",
  },
  {
    id: "INFLOWS_BY_CATEGORY",
    title: "Entradas por categoria",
    description: "Concentração das receitas por categoria.",
    group: "Financeiro",
  },
  {
    id: "MOVEMENTS_BY_ACCOUNT",
    title: "Movimentação por conta",
    description: "Entradas, saídas e líquido de cada conta.",
    group: "Financeiro",
    cashOnly: true,
  },
  {
    id: "MOVEMENTS_BY_PAYMENT_METHOD",
    title: "Movimentação por forma de pagamento",
    description: "Movimentos agrupados por forma de pagamento.",
    group: "Financeiro",
    cashOnly: true,
  },
  {
    id: "RECEIVABLES",
    title: "Contas a receber",
    description: "Parcelas e saldos ainda a receber.",
    group: "Obrigações",
    statuses: ["ALL", "PENDING", "OVERDUE"],
  },
  {
    id: "OVERDUE",
    title: "Contas vencidas",
    description: "Valores pendentes que já ultrapassaram o vencimento.",
    group: "Obrigações",
    statuses: ["ALL", "OVERDUE"],
  },
  {
    id: "PAYABLES",
    title: "Contas a pagar",
    description: "Parcelas e saldos ainda a pagar.",
    group: "Obrigações",
    statuses: ["ALL", "PENDING", "OVERDUE"],
  },
  {
    id: "CUSTOMER_HISTORY",
    title: "Histórico por cliente",
    description: "Lançamentos e liquidações de clientes.",
    group: "Relacionamentos",
  },
  {
    id: "SUPPLIER_HISTORY",
    title: "Histórico por fornecedor",
    description: "Lançamentos e liquidações de fornecedores.",
    group: "Relacionamentos",
  },
  {
    id: "SALES",
    title: "Vendas por período",
    description: "Vendas, valores, recebimento e situação.",
    group: "Vendas",
    statuses: [
      "ALL",
      "DRAFT",
      "CONFIRMED",
      "PARTIALLY_RECEIVED",
      "RECEIVED",
      "CANCELED",
    ],
  },
  {
    id: "SOLD_ITEMS",
    title: "Produtos e serviços vendidos",
    description: "Itens vendidos, quantidades e valor líquido.",
    group: "Vendas",
  },
];
const statusNames: Record<string, string> = {
  ALL: "Todas",
  DRAFT: "Rascunho",
  PENDING: "Pendente",
  SETTLED: "Liquidada",
  OVERDUE: "Atrasada",
  CANCELED: "Cancelada",
  CONFIRMED: "Confirmada",
  PARTIALLY_RECEIVED: "Parcialmente recebida",
  RECEIVED: "Recebida",
};
const generalStatuses = ["ALL", "PENDING", "SETTLED", "OVERDUE", "CANCELED"];
const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink";

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function initialDates() {
  const now = new Date();
  return {
    start: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: iso(now),
  };
}

export function ReportsPage() {
  const dates = useMemo(initialDates, []);
  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [selected, setSelected] = useState(reports[0].id);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(dates.start);
  const [endDate, setEndDate] = useState(dates.end);
  const [regime, setRegime] = useState<"CASH" | "ACCRUAL">("ACCRUAL");
  const [contactId, setContactId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sortBy, setSortBy] = useState("");
  const [sortDirection, setSortDirection] = useState<"ASC" | "DESC">("ASC");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const definition = reports.find((item) => item.id === selected)!;
  const allowedStatuses = definition.statuses ?? generalStatuses;
  const pageSize = 25;

  useEffect(() => {
    void getReportOptions()
      .then((value) => {
        setOptions(value);
        setRegime(value.defaultRegime);
      })
      .catch((reason: unknown) => setError(String(reason)));
  }, []);
  useEffect(() => {
    setStatus("ALL");
    setSortBy("");
    setPage(0);
    setResult(null);
    setMessage("");
  }, [selected]);

  const query = (forExport = false): ReportQuery => ({
    reportType: selected,
    startDate,
    endDate,
    regime: definition.cashOnly ? "CASH" : regime,
    contactId: contactId || null,
    categoryId: categoryId || null,
    financialAccountId: accountId || null,
    paymentMethodId: paymentId || null,
    status,
    sortBy,
    sortDirection,
    limit: forExport ? 100 : pageSize,
    offset: forExport ? 0 : page * pageSize,
  });
  const run = async (requested = query()) => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      setResult(await previewReport(requested));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  };
  const changePage = (nextPage: number) => {
    setPage(nextPage);
    void run({ ...query(), offset: nextPage * pageSize });
  };
  const changeSort = (key: string) => {
    const direction =
      sortBy === key && sortDirection === "ASC" ? "DESC" : "ASC";
    setSortBy(key);
    setSortDirection(direction);
    setPage(0);
    void run({ ...query(), sortBy: key, sortDirection: direction, offset: 0 });
  };
  const exportFile = async (kind: "pdf" | "csv") => {
    setError("");
    setMessage("");
    try {
      const path =
        kind === "pdf"
          ? await exportReportPdf(query(true), definition.title)
          : await exportReportCsv(query(true), definition.title);
      if (path)
        setMessage(`Relatório ${kind.toUpperCase()} salvo com sucesso.`);
    } catch (reason) {
      setError(String(reason));
    }
  };
  const print = () => {
    if (!result) return;
    document.body.dataset.reportOrientation =
      result.columns.length > 6 ? "landscape" : "portrait";
    window.print();
    delete document.body.dataset.reportOrientation;
  };
  const visible = reports.filter((item) =>
    `${item.title} ${item.description} ${item.group}`
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const groups = [...new Set(visible.map((item) => item.group))];

  return (
    <section className="mx-auto max-w-[1500px] py-8">
      <header>
        <p className="text-sm font-semibold text-brand">Fase 7</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">
          Central de relatórios
        </h1>
        <p className="mt-1 text-slate-600">
          Consulte, confira e compartilhe os números do negócio com filtros
          claros.
        </p>
      </header>
      <div className="mt-6 grid gap-5 xl:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="self-start rounded-xl border border-slate-200 bg-white p-3 shadow-surface xl:sticky xl:top-4">
          <label className="relative block">
            <span className="sr-only">Pesquisar relatórios</span>
            <Search
              size={17}
              className="absolute left-3 top-2.5 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Encontrar relatório"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
            />
          </label>
          <nav
            aria-label="Catálogo de relatórios"
            className="mt-3 max-h-[70vh] space-y-4 overflow-auto pr-1"
          >
            {groups.map((group) => (
              <div key={group}>
                <p className="px-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                  {group}
                </p>
                <div className="mt-1 space-y-1">
                  {visible
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setSelected(item.id)}
                        className={`w-full rounded-lg px-3 py-2 text-left ${selected === item.id ? "bg-blue-50 text-brand" : "hover:bg-slate-50"}`}
                      >
                        <span className="block text-sm font-semibold">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block text-xs leading-4 text-slate-600">
                          {item.description}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-surface">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-ink">
                  {definition.title}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {definition.description}
                </p>
              </div>
              {definition.cashOnly && (
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-brand">
                  Regime de caixa
                </span>
              )}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold text-slate-600">
                Data inicial
                <input
                  aria-label="Data inicial"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(0);
                  }}
                  className={`${inputClass} mt-1 w-full`}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Data final
                <input
                  aria-label="Data final"
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(0);
                  }}
                  className={`${inputClass} mt-1 w-full`}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Regime
                <select
                  aria-label="Regime"
                  disabled={definition.cashOnly}
                  value={definition.cashOnly ? "CASH" : regime}
                  onChange={(e) =>
                    setRegime(e.target.value as "CASH" | "ACCRUAL")
                  }
                  className={`${inputClass} mt-1 w-full disabled:bg-slate-100`}
                >
                  <option value="CASH">Caixa (pago/recebido)</option>
                  <option value="ACCRUAL">Competência (gerado)</option>
                </select>
              </label>
              <Select
                label="Situação"
                value={status}
                onChange={setStatus}
                values={allowedStatuses.map((id) => ({
                  id,
                  name: statusNames[id],
                }))}
              />
              <Select
                label="Contato"
                value={contactId}
                onChange={setContactId}
                values={options?.contacts ?? []}
              />
              <Select
                label="Categoria"
                value={categoryId}
                onChange={setCategoryId}
                values={options?.categories ?? []}
              />
              <Select
                label="Conta financeira"
                value={accountId}
                onChange={setAccountId}
                values={options?.accounts ?? []}
              />
              <Select
                label="Forma de pagamento"
                value={paymentId}
                onChange={setPaymentId}
                values={options?.paymentMethods ?? []}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                disabled={loading}
                onClick={() => {
                  setPage(0);
                  void run();
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50"
              >
                <Eye size={17} />
                {loading ? "Gerando…" : "Visualizar"}
              </button>
              <button
                disabled={!result}
                onClick={() => void exportFile("pdf")}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:opacity-40"
              >
                <Download size={17} />
                PDF
              </button>
              <button
                disabled={!result}
                onClick={() => void exportFile("csv")}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:opacity-40"
              >
                <FileSpreadsheet size={17} />
                CSV
              </button>
              <button
                disabled={!result}
                onClick={print}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:opacity-40"
              >
                <Printer size={17} />
                Imprimir
              </button>
            </div>
          </div>
          {message && (
            <p
              role="status"
              className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-positive"
            >
              {message}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-critical"
            >
              {toUserMessage(error)}
            </p>
          )}
          {!result && !loading && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <FileSpreadsheet className="mx-auto text-slate-400" />
              <h3 className="mt-3 font-bold text-ink">Pronto para gerar</h3>
              <p className="mt-1 text-sm text-slate-500">
                Escolha o período e os filtros, depois clique em Visualizar.
              </p>
            </div>
          )}
          {result && (
            <ReportPreview
              result={result}
              sortBy={sortBy}
              sortDirection={sortDirection}
              onSort={changeSort}
            />
          )}
          {result && (
            <footer className="flex items-center justify-between text-sm text-slate-600">
              <span>
                {result.totalRows.toLocaleString("pt-BR")} registro(s)
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => changePage(page - 1)}
                  className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40"
                >
                  Anterior
                </button>
                <span>Página {page + 1}</span>
                <button
                  disabled={(page + 1) * pageSize >= result.totalRows}
                  onClick={() => changePage(page + 1)}
                  className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            </footer>
          )}
        </div>
      </div>
    </section>
  );
}

function Select({
  label,
  value,
  onChange,
  values,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  values: { id: string; name: string }[];
}) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} mt-1 w-full`}
      >
        {label !== "Situação" && (
          <option value="">Todos ({label.toLocaleLowerCase("pt-BR")})</option>
        )}
        {values.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReportPreview({
  result,
  sortBy,
  sortDirection,
  onSort,
}: {
  result: ReportResult;
  sortBy: string;
  sortDirection: string;
  onSort: (key: string) => void;
}) {
  return (
    <article
      id="report-preview"
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-surface ${result.columns.length > 6 ? "report-print-landscape" : "report-print-portrait"}`}
    >
      <header className="border-b border-slate-200 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-brand">
          CaixaSimples - Bratec
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold text-ink">{result.title}</h2>
          <span className="text-xs text-slate-500">
            Gerado em {new Date(result.generatedAt).toLocaleString("pt-BR")}
          </span>
        </div>
        <p className="mt-1 font-semibold text-slate-700">
          {result.businessName}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Regime: {result.regime === "CASH" ? "Caixa" : "Competência"} ·{" "}
          {result.filtersSummary}
        </p>
        <p className="mt-1 text-xs text-slate-500">{result.layoutNotice}</p>
      </header>
      {result.totals.length > 0 && (
        <div className="grid gap-2 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {result.totals.map((total) => (
            <div
              key={total.label}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <p className="text-xs text-slate-500">{total.label}</p>
              <p className="font-bold text-ink">
                {formatReportValue(total.raw, total.kind)}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {result.columns.map((column) => (
                <th
                  key={column.key}
                  className={`whitespace-nowrap px-4 py-3 ${["MONEY", "NUMBER", "PERCENT", "QUANTITY"].includes(column.kind) ? "text-right" : ""}`}
                >
                  <button
                    onClick={() => onSort(column.key)}
                    className="inline-flex items-center gap-1 font-semibold"
                  >
                    {column.label}
                    {sortBy === column.key &&
                      (sortDirection === "ASC" ? (
                        <ArrowUp size={13} />
                      ) : (
                        <ArrowDown size={13} />
                      ))}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={result.columns.length}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  Nenhum registro encontrado para os filtros escolhidos.
                </td>
              </tr>
            ) : (
              result.rows.map((row, index) => (
                <tr key={row.id ?? index} className="hover:bg-slate-50">
                  {row.cells.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={`whitespace-nowrap px-4 py-3 ${["MONEY", "NUMBER", "PERCENT", "QUANTITY"].includes(result.columns[cellIndex].kind) ? "text-right tabular-nums" : ""}`}
                    >
                      {formatReportValue(
                        cell.raw,
                        result.columns[cellIndex].kind,
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <footer className="hidden border-t border-slate-200 p-3 text-center text-xs text-slate-500 print:block">
        CaixaSimples - Bratec · {result.businessName}
      </footer>
    </article>
  );
}
