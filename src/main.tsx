import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import "./styles/index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Elemento raiz da aplicação não encontrado.");
}

async function bootstrap(root: HTMLElement) {
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).has("qualityPreview")
  ) {
    const { installQualityPreview } = await import("./quality/preview");
    installQualityPreview();
  }

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap(rootElement);
