import { useState } from "react";
import { CheckCircle2, Play, RotateCcw } from "lucide-react";
import {
  chooseBackup,
  inspectBackup,
  relaunchApplication,
  restoreBackup,
  type BackupInfo,
} from "../../infrastructure/continuity";
import { toUserMessage } from "../../domain/errors";
import { SubscriptionPanel } from "../subscription/SubscriptionPanel";

export function Welcome({ onStart }: { onStart: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [backup, setBackup] = useState<BackupInfo | null>(null);
  const [backupPassword, setBackupPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectBackup = async () => {
    const path = await chooseBackup();
    if (!path) return;
    setBusy(true);
    setError(null);
    try {
      let password: string | null = null;
      try {
        setBackup(await inspectBackup(path, null));
      } catch (e) {
        if (!String(e).includes("protegido")) throw e;
        password = window.prompt("Este backup é protegido. Informe a senha:");
        if (!password)
          throw new Error("A senha é necessária para validar este backup.");
        setBackup(await inspectBackup(path, password));
      }
      setBackupPassword(password);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    if (!backup) return;
    if (
      !window.confirm(
        "Os dados atuais serão substituídos. Um backup preventivo será criado. Deseja continuar?",
      )
    )
      return;
    setBusy(true);
    try {
      await restoreBackup(backup.path, backupPassword);
      setSuccess("Backup restaurado e validado. Reiniciando o aplicativo…");
      await relaunchApplication();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-surface">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-xl font-black text-white"
          >
            B
          </span>
          <div>
            <p className="font-bold text-ink">BratecInfo</p>
            <p className="text-xs text-slate-500">versão 1.1.0</p>
          </div>
        </div>
        <h1 className="mt-5 text-3xl font-bold text-ink">Caixa no Controle</h1>
        <p className="mt-3 leading-7 text-slate-600">
          Registre suas movimentações em poucos segundos e entenda seu negócio
          com clareza.
        </p>
        <div className="mt-8 grid gap-3">
          <button
            disabled={busy}
            onClick={onStart}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            <Play size={18} />
            Começar configuração
          </button>
          <button
            disabled={busy}
            onClick={() => void selectBackup()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 font-medium"
          >
            <RotateCcw size={18} />
            Restaurar backup
          </button>
        </div>
        <div className="mt-6"><SubscriptionPanel /></div>
        {backup && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="font-semibold text-ink">
              Backup de {backup.businessName ?? "empresa não identificada"}
            </p>
            <p className="mt-1 text-slate-600">
              Criado em{" "}
              {new Date(backup.generatedAtEpoch * 1000).toLocaleString("pt-BR")}{" "}
              · versão {backup.appVersion}
            </p>
            <p className="mt-1 text-slate-600">
              Checksum validado: {backup.checksum.slice(0, 16)}…
            </p>
            <button
              disabled={busy}
              onClick={() => void restore()}
              className="mt-3 rounded-lg bg-attention px-3 py-2 font-semibold text-white"
            >
              Confirmar restauração
            </button>
          </div>
        )}
        {success && (
          <p
            role="status"
            className="mt-4 flex gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-positive"
          >
            <CheckCircle2 size={18} aria-hidden="true" />
            {success}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-critical"
          >
            {toUserMessage(error)}
          </p>
        )}
      </section>
    </main>
  );
}
