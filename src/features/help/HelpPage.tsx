import { useMemo, useState } from "react";
import {
  BookOpenText,
  DatabaseBackup,
  Keyboard,
  LifeBuoy,
  Search,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { toUserMessage } from "../../domain/errors";
import { applicationVersion, openUserManual } from "../../infrastructure/help";

const topics = [
  {
    title: "Primeiros passos",
    terms: "onboarding empresa conta saldo senha categorias pagamento demonstração",
    text: "No primeiro acesso, informe os dados do negócio, a conta inicial, as categorias, as formas de pagamento e a senha local. Você pode carregar um pacote demonstrativo removível para conhecer os módulos.",
  },
  {
    title: "Receitas e despesas",
    terms: "movimentações receita despesa receber pagar liquidação parcial",
    text: "Use Movimentações para lançamentos e Contas a receber ou Contas a pagar para acompanhar vencimentos. Uma liquidação parcial mantém o valor restante em aberto.",
  },
  {
    title: "Vendas e parcelas",
    terms: "venda cliente produto serviço parcelas recibo",
    text: "Cadastre o cliente e os itens antes da venda. Ao confirmar uma venda futura ou parcelada, o sistema gera as contas a receber vinculadas automaticamente.",
  },
  {
    title: "Caixa e competência",
    terms: "fluxo regime caixa competência saldo transferência faturamento",
    text: "O regime de caixa considera liquidações; o de competência considera quando a receita ou despesa pertence ao negócio. Transferências movimentam contas, mas não alteram o resultado.",
  },
  {
    title: "Backup e restauração",
    terms: "backup senha restaurar recuperação atualização dados",
    text: "Crie backups frequentes, preferencialmente protegidos por senha e fora do computador. A restauração valida integridade, cria uma cópia preventiva e reinicia o aplicativo.",
  },
  {
    title: "Licença offline",
    terms: "licença ativar arquivo cnclic demonstração internet",
    text: "A ativação usa um arquivo .cnclic assinado e funciona sem internet. A chave privada da BratecInfo nunca faz parte do aplicativo ou do instalador.",
  },
  {
    title: "Dados demonstrativos",
    terms: "demo exemplo remover configurações",
    text: "O pacote de exemplo é identificado como demonstração e pode ser carregado ou removido em Configurações sem afetar os registros reais.",
  },
  {
    title: "Diagnóstico",
    terms: "erro suporte diagnóstico logs privacidade",
    text: "Em Backup, gere um pacote de diagnóstico para o suporte. Ele inclui informações técnicas e logs, mas exclui o banco financeiro e as senhas.",
  },
];

export function HelpPage() {
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const visibleTopics = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return topics;
    return topics.filter(({ title, terms, text }) =>
      `${title} ${terms} ${text}`.toLocaleLowerCase("pt-BR").includes(normalized),
    );
  }, [query]);

  const openManual = async () => {
    setOpening(true);
    setFeedback(null);
    try {
      await openUserManual();
      setFeedback("Manual aberto no leitor de PDF padrão do Windows.");
    } catch (reason) {
      setFeedback(toUserMessage(reason));
    } finally {
      setOpening(false);
    }
  };

  return (
    <section className="mx-auto max-w-5xl py-8">
      <header className="rounded-2xl bg-ink px-6 py-7 text-white shadow-surface sm:px-8">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-sm font-semibold text-blue-200">Central de ajuda</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Como podemos ajudar?</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
              Encontre orientações rápidas ou abra o manual completo, disponível também sem internet.
            </p>
          </div>
          <LifeBuoy className="hidden text-blue-200 sm:block" size={40} aria-hidden="true" />
        </div>
        <label className="relative mt-6 block max-w-2xl text-ink">
          <span className="sr-only">Pesquisar na ajuda</span>
          <Search className="pointer-events-none absolute left-3 top-3.5 text-slate-400" size={19} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busque por vendas, backup, licença…"
            className="min-h-12 w-full rounded-xl border border-transparent bg-white py-3 pl-10 pr-4 text-sm shadow-sm"
          />
        </label>
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div>
          <h2 className="text-lg font-semibold text-ink">Orientações rápidas</h2>
          {visibleTopics.length ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {visibleTopics.map((topic) => (
                <article key={topic.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-surface">
                  <h3 className="font-semibold text-ink">{topic.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{topic.text}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="font-medium text-ink">Nenhuma orientação encontrada</p>
              <p className="mt-1 text-sm text-slate-500">Tente uma palavra mais ampla ou consulte o manual completo.</p>
            </div>
          )}
        </div>

        <aside className="space-y-4" aria-label="Recursos de ajuda">
          <article className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <BookOpenText className="text-brand" aria-hidden="true" />
            <h2 className="mt-2 font-semibold text-ink">Manual do usuário</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Instalação, rotinas financeiras, relatórios, backup e solução de problemas.</p>
            <button
              type="button"
              onClick={() => void openManual()}
              disabled={opening}
              className="mt-4 min-h-11 w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
            >
              {opening ? "Abrindo…" : "Abrir manual completo"}
            </button>
            {feedback && <p role="status" className="mt-3 text-xs leading-5 text-slate-600">{feedback}</p>}
          </article>
          <Info icon={WifiOff} title="Funciona offline" text="Banco, manual e rotinas essenciais continuam locais; a assinatura usa uma autorização temporária renovada quando houver internet." />
          <Info icon={DatabaseBackup} title="Proteja seus dados" text="Mantenha backups em outro dispositivo e teste a restauração periodicamente." />
          <Info icon={ShieldCheck} title="Privacidade local" text="Os dados financeiros permanecem no computador; o diagnóstico não inclui o banco." />
          <Info icon={Keyboard} title="Acessibilidade" text="Use Tab e Shift+Tab para navegar, Enter para ativar e Esc para fechar diálogos." />
          <p className="px-1 text-xs text-slate-500">CaixaSimples - Bratec v{applicationVersion} · BratecInfo</p>
        </aside>
      </div>
    </section>
  );
}

function Info({ icon: Icon, title, text }: { icon: typeof WifiOff; title: string; text: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <Icon className="text-brand" size={20} aria-hidden="true" />
      <h2 className="mt-2 text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-600">{text}</p>
    </article>
  );
}
