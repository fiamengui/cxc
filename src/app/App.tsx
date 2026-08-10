import { useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { Onboarding } from "../features/onboarding/Onboarding";
import { getOnboardingStatus } from "../infrastructure/onboarding";
import { Welcome } from "../features/activation/Welcome";

type AppMode = "loading" | "welcome" | "onboarding" | "app";

export function App() {
  const [mode, setMode] = useState<AppMode>("loading");

  const refresh = () => getOnboardingStatus().then((status) => setMode(status.isCompleted ? "app" : "welcome"));

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      const localPreview = ["127.0.0.1", "localhost"].includes(window.location.hostname);
      const previewFirstRun = localPreview && new URLSearchParams(window.location.search).has("firstRun");
      setMode(previewFirstRun ? "welcome" : "app");
      return;
    }
    void refresh().catch(() => setMode("welcome"));
  }, []);

  if (mode === "loading") return <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-600">Preparando seu espaço de trabalho…</main>;
  if (mode === "welcome") return <Welcome onStart={() => setMode("onboarding")} />;
  if (mode === "onboarding") return <Onboarding onCompleted={() => setMode("app")} />;
  return <AppShell />;
}
