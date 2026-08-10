import { Component, createRef, type ReactNode } from "react";
import { CircleAlert, House, RotateCcw } from "lucide-react";

type Props = { children: ReactNode };
type State = { failed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };
  private readonly heading = createRef<HTMLHeadingElement>();

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch() {
    // O detalhe pode conter dados locais. A tela mostra apenas orientação segura.
  }

  componentDidUpdate(_previousProps: Props, previousState: State) {
    if (!previousState.failed && this.state.failed) this.heading.current?.focus();
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <section
          role="alert"
          className="w-full max-w-xl rounded-2xl border border-red-200 bg-white p-8 text-center shadow-surface"
        >
          <CircleAlert
            aria-hidden="true"
            className="mx-auto text-critical"
            size={42}
          />
          <h1
            ref={this.heading}
            tabIndex={-1}
            className="mt-4 text-2xl font-bold text-ink"
          >
            Não foi possível exibir esta tela
          </h1>
          <p className="mx-auto mt-2 max-w-md text-slate-600">
            Seus dados continuam salvos. Recarregue o aplicativo; se o problema
            persistir, gere um diagnóstico na área de Backup.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 font-semibold text-white"
            >
              <RotateCcw size={18} aria-hidden="true" />
              Recarregar
            </button>
            <button
              type="button"
              onClick={() => {
                window.history.replaceState({}, "", "/");
                this.setState({ failed: false });
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-semibold text-ink"
            >
              <House size={18} aria-hidden="true" />
              Voltar ao início
            </button>
          </div>
        </section>
      </main>
    );
  }
}
