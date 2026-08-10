import { lazy, Suspense, useEffect, useState } from "react";
import {
  BarChart3,
  Box,
  CircleArrowDown,
  CircleArrowUp,
  CircleHelp,
  ContactRound,
  FileBarChart,
  FolderCog,
  Gauge,
  Goal,
  Menu,
  Package,
  ReceiptText,
  Settings,
  WalletCards,
  X,
} from "lucide-react";
import {
  getPhase2Status,
  runAutomaticBackup,
  type Phase2Status,
} from "../infrastructure/continuity";
import { DashboardPage } from "../features/management/DashboardPage";

const BackupPage = lazy(() =>
  import("../features/backup/BackupPage").then((module) => ({
    default: module.BackupPage,
  })),
);
const SettingsPage = lazy(() =>
  import("../features/settings/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);
const ContactsPage = lazy(() =>
  import("../features/contacts/ContactsPage").then((module) => ({
    default: module.ContactsPage,
  })),
);
const CatalogPage = lazy(() =>
  import("../features/catalog/CatalogPage").then((module) => ({
    default: module.CatalogPage,
  })),
);
const MasterDataPage = lazy(() =>
  import("../features/masters/MasterDataPage").then((module) => ({
    default: module.MasterDataPage,
  })),
);
const MovementsPage = lazy(() =>
  import("../features/finance/MovementsPage").then((module) => ({
    default: module.MovementsPage,
  })),
);
const ObligationsPage = lazy(() =>
  import("../features/finance/ObligationsPage").then((module) => ({
    default: module.ObligationsPage,
  })),
);
const CashFlowPage = lazy(() =>
  import("../features/finance/CashFlowPage").then((module) => ({
    default: module.CashFlowPage,
  })),
);
const SalesPage = lazy(() =>
  import("../features/sales/SalesPage").then((module) => ({
    default: module.SalesPage,
  })),
);
const GoalsPage = lazy(() =>
  import("../features/management/GoalsPage").then((module) => ({
    default: module.GoalsPage,
  })),
);
const ReportsPage = lazy(() =>
  import("../features/reports/ReportsPage").then((module) => ({
    default: module.ReportsPage,
  })),
);
const HelpPage = lazy(() =>
  import("../features/help/HelpPage").then((module) => ({
    default: module.HelpPage,
  })),
);

type NavigationItem = {
  label: string;
  path: string;
  icon: typeof Gauge;
  phase: string;
};

const navigation: NavigationItem[] = [
  { label: "Visão geral", path: "/", icon: Gauge, phase: "Fase 6" },
  {
    label: "Movimentações",
    path: "/movimentacoes",
    icon: WalletCards,
    phase: "Fase 4",
  },
  {
    label: "Contas a receber",
    path: "/receber",
    icon: CircleArrowDown,
    phase: "Fase 4",
  },
  {
    label: "Contas a pagar",
    path: "/pagar",
    icon: CircleArrowUp,
    phase: "Fase 4",
  },
  {
    label: "Fluxo de caixa",
    path: "/fluxo-de-caixa",
    icon: BarChart3,
    phase: "Fase 4",
  },
  { label: "Vendas", path: "/vendas", icon: ReceiptText, phase: "Fase 5" },
  {
    label: "Clientes e fornecedores",
    path: "/contatos",
    icon: ContactRound,
    phase: "Fase 3",
  },
  {
    label: "Produtos e serviços",
    path: "/catalogo",
    icon: Package,
    phase: "Fase 3",
  },
  {
    label: "Cadastros básicos",
    path: "/cadastros",
    icon: FolderCog,
    phase: "Fase 3",
  },
  { label: "Metas", path: "/metas", icon: Goal, phase: "Fase 6" },
  {
    label: "Relatórios",
    path: "/relatorios",
    icon: FileBarChart,
    phase: "Fase 7",
  },
  { label: "Backup", path: "/backup", icon: Box, phase: "Fase 2" },
  {
    label: "Configurações",
    path: "/configuracoes",
    icon: Settings,
    phase: "Fase 2",
  },
  { label: "Ajuda", path: "/ajuda", icon: CircleHelp, phase: "Fase 10" },
];

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(() =>
    window.matchMedia("(min-width: 1024px)").matches,
  );
  const [phase2, setPhase2] = useState<Phase2Status | null>(null);
  const [path, setPath] = useState(window.location.pathname);
  const activeItem =
    navigation.find((item) => item.path === path) ?? navigation[0];

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const refreshEntitlement = () => void getPhase2Status().then(setPhase2).catch(() => undefined);
    void Promise.all([
      getPhase2Status().then(setPhase2),
      runAutomaticBackup().catch(() => null),
    ]).catch(() => undefined);
    window.addEventListener("cnc-entitlement-changed", refreshEntitlement);
    window.addEventListener("focus", refreshEntitlement);
    return () => {
      window.removeEventListener("cnc-entitlement-changed", refreshEntitlement);
      window.removeEventListener("focus", refreshEntitlement);
    };
  }, []);
  useEffect(() => {
    const handleNavigation = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handleNavigation);
    return () => window.removeEventListener("popstate", handleNavigation);
  }, []);
  const navigate = (
    event: React.MouseEvent<HTMLAnchorElement>,
    target: string,
  ) => {
    event.preventDefault();
    if (target !== path) window.history.pushState({}, "", target);
    setPath(target);
    if (!window.matchMedia("(min-width: 1024px)").matches) setMenuOpen(false);
  };
  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[auto_1fr]">
      <a className="skip-link" href="#conteudo-principal">
        Ir para o conteúdo principal
      </a>
      {menuOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 h-auto w-full bg-slate-950/40 lg:hidden"
        />
      )}
      <aside
        aria-label="Menu lateral"
        className={`fixed inset-y-0 left-0 z-40 flex border-r border-slate-800 bg-ink text-slate-100 transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:h-screen ${menuOpen ? "w-60 translate-x-0" : "w-60 -translate-x-full lg:w-[72px] lg:translate-x-0"}`}
      >
        <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-700 px-4">
          {(menuOpen || !window.matchMedia("(min-width: 1024px)").matches) && (
            <span className="font-semibold tracking-tight">
              CaixaSimples - Bratec
            </span>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Recolher menu" : "Expandir menu"}
            title={menuOpen ? "Recolher menu" : "Expandir menu"}
            className="grid min-h-11 min-w-11 place-items-center rounded-md text-slate-200 hover:bg-slate-800"
          >
            {menuOpen ? (
              <X size={20} aria-hidden="true" />
            ) : (
              <Menu size={20} aria-hidden="true" />
            )}
          </button>
        </div>
        <nav aria-label="Navegação principal" className="flex-1 space-y-1 overflow-y-auto p-2">
          {navigation.map(({ label, path, icon: Icon }) => {
            const active = path === activeItem.path;
            return (
              <a
                key={path}
                href={path}
                onClick={(event) => navigate(event, path)}
                title={!menuOpen ? label : undefined}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-brand text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
              >
                <Icon size={20} aria-hidden="true" />
                {menuOpen && <span>{label}</span>}
              </a>
            );
          })}
        </nav>
        </div>
      </aside>
      <main id="conteudo-principal" tabIndex={-1} className="min-w-0 px-4 pb-10 sm:px-6">
        <div className="flex min-h-16 items-center gap-3 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
            className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <p className="text-sm font-medium text-slate-500">
            {activeItem.label}
          </p>
        </div>
        {phase2 && ["EXPIRED","CANCELED","REFUNDED","PAYMENT_FAILED","REVALIDATION_REQUIRED"].includes(phase2.subscriptionState) && (
          <div role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-bold">Sua assinatura precisa ser renovada</p>
            <p className="mt-1">Seus dados continuam seguros e disponíveis para consulta. Regularize ou valide a assinatura para registrar novas movimentações.</p>
            <a href="/configuracoes" onClick={(event)=>navigate(event,"/configuracoes")} className="mt-3 inline-block rounded-lg bg-brand px-3 py-2 font-semibold text-white">Ir para Meu plano</a>
          </div>
        )}
        {phase2 && phase2.trialUsageCount >= 40 && ["TRIAL", "TRIAL_LIMIT_REACHED"].includes(phase2.licenseStatus) && (
          <div
            role="status"
            className={`mt-4 rounded-lg border px-4 py-3 text-sm ${phase2.trialExpired ? "border-red-200 bg-red-50 text-critical" : "border-blue-200 bg-blue-50 text-blue-900"}`}
          >
            <p className="font-semibold">
              {phase2.trialUsageCount} de {phase2.trialEntryLimit ?? 50} movimentações gratuitas utilizadas
            </p>
            <p className="mt-1">
              {phase2.trialExpired
                ? "Seu teste chegou ao limite. Consultas e relatórios continuam disponíveis; ative para registrar novas movimentações."
                : `${phase2.trialRemainingEntries ?? 50} movimentações restantes. O teste não expira por data e seus dados serão preservados.`}
            </p>
            {phase2.trialUsageCount >= 45 && (
              <div className="mt-3 rounded-lg border border-red-200 bg-white p-3 text-slate-700">
                <p className="font-bold text-ink">Continue com o plano Essencial</p>
                <p className="mt-1">Mensal por R$ 9,90 ou anual por R$ 99,90. Seus dados serão preservados.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href="/configuracoes" onClick={(event)=>navigate(event,"/configuracoes")} className="rounded-lg bg-brand px-3 py-2 font-semibold text-white">Ver planos e assinar</a>
                </div>
              </div>
            )}
          </div>
        )}
        <Suspense
          fallback={
            <p role="status" className="py-10 text-slate-500">
              Carregando módulo…
            </p>
          }
        >
          {activeItem.path === "/" ? (
            <DashboardPage />
          ) : activeItem.path === "/backup" ? (
            <BackupPage />
          ) : activeItem.path === "/configuracoes" ? (
            <SettingsPage />
          ) : activeItem.path === "/contatos" ? (
            <ContactsPage />
          ) : activeItem.path === "/catalogo" ? (
            <CatalogPage />
          ) : activeItem.path === "/cadastros" ? (
            <MasterDataPage />
          ) : activeItem.path === "/movimentacoes" ? (
            <MovementsPage />
          ) : activeItem.path === "/receber" ? (
            <ObligationsPage kind="RECEIVABLE" />
          ) : activeItem.path === "/pagar" ? (
            <ObligationsPage kind="PAYABLE" />
          ) : activeItem.path === "/fluxo-de-caixa" ? (
            <CashFlowPage />
          ) : activeItem.path === "/vendas" ? (
            <SalesPage />
          ) : activeItem.path === "/metas" ? (
            <GoalsPage />
          ) : activeItem.path === "/relatorios" ? (
            <ReportsPage />
          ) : activeItem.path === "/ajuda" ? (
            <HelpPage />
          ) : (
            <DashboardPage />
          )}
        </Suspense>
      </main>
    </div>
  );
}
