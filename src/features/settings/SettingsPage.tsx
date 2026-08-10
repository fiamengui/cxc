import { useEffect, useState } from "react";
import { Building2, Database, Goal, Info, LockKeyhole, Tags, WalletCards } from "lucide-react";
import {
  getInitialConfiguration,
  type InitialConfiguration,
} from "../../infrastructure/onboarding";
import { toUserMessage } from "../../domain/errors";
import {
  getPhase2Status,
  loadDemoData,
  removeDemoData,
  type Phase2Status,
} from "../../infrastructure/continuity";
import { SubscriptionPanel } from "../subscription/SubscriptionPanel";
import { getCommercialBuildInfo, type TechnicalBuildInfo } from "../../infrastructure/commercial";

const businessTypes: Record<string, string> = {
  SERVICE_PROVIDER: "Prestador de serviços",
  RETAIL: "Comércio",
  BEAUTY: "Salão ou beleza",
  REPAIR: "Oficina ou assistência",
  FOOD: "Alimentação",
  SALES: "Representação ou vendas",
  PROFESSIONAL: "Profissional liberal",
  GENERAL: "Negócio genérico",
};
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function SettingsPage() {
  const [configuration, setConfiguration] =
    useState<InitialConfiguration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoStatus, setDemoStatus] = useState<Phase2Status | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoFeedback, setDemoFeedback] = useState<string | null>(null);
  const [buildInfo,setBuildInfo]=useState<TechnicalBuildInfo|null>(null);
  useEffect(() => {
    void Promise.all([getInitialConfiguration(), getPhase2Status()])
      .then(([initial, status]) => {
        setConfiguration(initial);
        setDemoStatus(status);
      })
      .catch((reason) => setError(String(reason)));
    void getCommercialBuildInfo().then(setBuildInfo).catch(()=>undefined);
  }, []);

  const updateDemo = async (remove: boolean) => {
    if (
      remove &&
      !window.confirm(
        "Remover todos os contatos, itens, vendas e movimentações identificados como demonstração? Seus dados reais serão preservados.",
      )
    )
      return;
    setDemoBusy(true);
    setDemoFeedback(null);
    try {
      const status = remove ? await removeDemoData() : await loadDemoData();
      setDemoStatus(status);
      setDemoFeedback(
        remove
          ? "Dados demonstrativos removidos. Seus registros reais foram preservados."
          : "Pacote demonstrativo carregado com sucesso.",
      );
    } catch (reason) {
      setDemoFeedback(toUserMessage(reason));
    } finally {
      setDemoBusy(false);
    }
  };
  return (
    <section className="mx-auto max-w-4xl py-8">
      <header>
        <h1 className="text-2xl font-bold text-ink">Configuração inicial</h1>
        <p className="mt-1 text-slate-600">
          Confira como o espaço de trabalho foi preparado no primeiro acesso.
        </p>
      </header>
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-critical"
        >
          {toUserMessage(error)}
        </p>
      )}
      {!configuration && !error && (
        <p role="status" className="mt-5 text-slate-500">Carregando configurações…</p>
      )}
      {configuration && (
        <div className="mt-6"><SubscriptionPanel defaultName={configuration.businessName} /></div>
      )}
      {configuration && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card icon={Building2} title="Empresa">
            <Row label="Nome" value={configuration.businessName} />
            <Row
              label="Tipo"
              value={
                businessTypes[configuration.businessType] ??
                configuration.businessType
              }
            />
          </Card>
          <Card icon={WalletCards} title="Conta inicial">
            <Row label="Conta" value={configuration.accountName} />
            <Row
              label="Saldo"
              value={money.format(configuration.openingBalanceCents / 100)}
            />
            <Row
              label="Data"
              value={new Date(
                `${configuration.openingBalanceDate}T00:00:00`,
              ).toLocaleDateString("pt-BR")}
            />
          </Card>
          <Card icon={Tags} title="Preferências">
            <Row
              label="Categorias"
              value={String(configuration.categoryCount)}
            />
            <Row
              label="Pagamentos"
              value={String(configuration.paymentMethodCount)}
            />
            <Row
              label="Regime"
              value={
                configuration.defaultViewRegime === "CASH"
                  ? "Caixa"
                  : "Competência"
              }
            />
            <Row
              label="Tema"
              value={
                configuration.theme === "LIGHT" ? "Claro" : configuration.theme
              }
            />
          </Card>
          <Card icon={Goal} title="Meta mensal">
            <Row
              label="Receita"
              value={
                configuration.monthlyGoalCents === null
                  ? "Não definida"
                  : money.format(configuration.monthlyGoalCents / 100)
              }
            />
          </Card>
          <Card icon={LockKeyhole} title="Administrador">
            <Row label="Nome" value={configuration.adminName} />
            <Row label="Usuário" value={configuration.username} />
            <p className="mt-3 text-xs leading-5 text-slate-500">
              A senha permanece protegida e nunca é exibida.
            </p>
          </Card>
          <Card icon={Database} title="Dados demonstrativos">
            <Row
              label="Estado"
              value={demoStatus?.demoDataLoaded ? "Carregados" : "Não carregados"}
            />
            <p className="mt-3 text-xs leading-5 text-slate-500">
              O pacote inclui exemplos de clientes, fornecedor, catálogo, venda parcelada, receitas e despesas. Todos são identificados e removíveis.
            </p>
            <button
              type="button"
              disabled={demoBusy}
              onClick={() => void updateDemo(Boolean(demoStatus?.demoDataLoaded))}
              className={`mt-4 min-h-11 w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-60 ${demoStatus?.demoDataLoaded ? "border border-red-300 bg-white text-critical hover:bg-red-50" : "bg-brand text-white hover:bg-blue-700"}`}
            >
              {demoBusy
                ? "Processando…"
                : demoStatus?.demoDataLoaded
                  ? "Remover dados demonstrativos"
                  : "Carregar dados demonstrativos"}
            </button>
            {demoFeedback && (
              <p role="status" className="mt-3 text-xs leading-5 text-slate-600">
                {demoFeedback}
              </p>
            )}
          </Card>
          {buildInfo&&<Card icon={Info} title="Informações técnicas"><Row label="Produto" value={buildInfo.product}/><Row label="Versão" value={buildInfo.version}/><Row label="Build" value={buildInfo.build}/><Row label="Ambiente" value={buildInfo.environment}/><Row label="Canal" value={buildInfo.releaseChannel}/><Row label="API" value={buildInfo.apiEndpoint}/><Row label="Instalação" value={buildInfo.installationId}/></Card>}
        </div>
      )}
    </section>
  );
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Building2;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-surface">
      <Icon className="text-brand" aria-hidden="true" />
      <h2 className="mb-3 mt-2 font-semibold text-ink">{title}</h2>
      <dl className="space-y-2 text-sm">{children}</dl>
    </article>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
