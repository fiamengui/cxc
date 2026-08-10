import { useEffect, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Copy,
  DatabaseBackup,
  FileHeart,
  FolderOpen,
  HardDrive,
  KeyRound,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
  Upload,
} from "lucide-react";
import { backupPasswordError } from "../../domain/continuity";
import { toUserMessage } from "../../domain/errors";
import {
  activateLicense,
  chooseBackup,
  chooseBackupDestination,
  chooseBackupDirectory,
  chooseDiagnosticDestination,
  chooseLicense,
  chooseUpdate,
  createBackup,
  createDiagnosticPackage,
  getContinuityOverview,
  getPhase2Status,
  inspectBackup,
  inspectUpdate,
  installPreparedUpdate,
  prepareUpdate,
  relaunchApplication,
  restoreBackup,
  saveBackupSettings,
  type BackupInfo,
  type ContinuityOverview,
  type Phase2Status,
  type UpdateInfo,
} from "../../infrastructure/continuity";

const button =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50";
const field =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const bytes = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "unit",
    unit: value >= 1_048_576 ? "megabyte" : "kilobyte",
    maximumFractionDigits: 1,
  }).format(value / (value >= 1_048_576 ? 1_048_576 : 1024));

export function BackupPage() {
  const [status, setStatus] = useState<Phase2Status | null>(null);
  const [overview, setOverview] = useState<ContinuityOverview | null>(null);
  const [selectedPath, setSelectedPath] = useState("");
  const [selected, setSelected] = useState<BackupInfo | null>(null);
  const [backupPassword, setBackupPassword] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [protect, setProtect] = useState(false);
  const [directory, setDirectory] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState("WEEKLY");
  const [retention, setRetention] = useState(12);
  const [updatePath, setUpdatePath] = useState("");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [license, continuity] = await Promise.all([
      getPhase2Status(),
      getContinuityOverview(),
    ]);
    setStatus(license);
    setOverview(continuity);
    setDirectory(continuity.settings.directory ?? "");
    setEnabled(continuity.settings.enabled);
    setFrequency(
      continuity.settings.frequency === "DISABLED"
        ? "WEEKLY"
        : continuity.settings.frequency,
    );
    setRetention(continuity.settings.retentionCount);
  };
  useEffect(() => {
    void refresh().catch((reason) => setError(String(reason)));
  }, []);
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      await refresh();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const manualBackup = async () => {
    const passwordError = protect ? backupPasswordError(backupPassword) : null;
    if (passwordError) {
      setError(passwordError);
      return;
    }
    const path = await chooseBackupDestination();
    if (path)
      await run(
        () => createBackup(path, protect ? backupPassword : null),
        "Backup criado, verificado e registrado.",
      );
  };
  const selectBackup = async () => {
    const path = await chooseBackup();
    if (path) {
      setSelectedPath(path);
      setSelected(null);
      setRestorePassword("");
      setMessage(
        "Arquivo selecionado. Se ele possuir proteção, informe a senha antes de validar.",
      );
    }
  };
  const validateBackup = () =>
    run(
      async () =>
        setSelected(await inspectBackup(selectedPath, restorePassword || null)),
      "Integridade, manifesto e conteúdo validados.",
    );
  const restore = async () => {
    if (
      !selected ||
      !window.confirm(
        "Os dados atuais serão substituídos após a criação de um backup preventivo. Continuar?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await restoreBackup(selected.path, restorePassword || null);
      setMessage("Restauração concluída e auditada. Reiniciando…");
      await relaunchApplication();
    } catch (reason) {
      setError(String(reason));
      setBusy(false);
    }
  };
  const saveSettings = () =>
    run(
      () =>
        saveBackupSettings({
          directory: directory || null,
          enabled,
          frequency: enabled ? frequency : "DISABLED",
          retentionCount: retention,
        }),
      "Política de backup automático salva.",
    );
  const pickDirectory = async () => {
    const value = await chooseBackupDirectory();
    if (value) setDirectory(value);
  };
  const diagnostic = async () => {
    const path = await chooseDiagnosticDestination();
    if (path)
      await run(
        () => createDiagnosticPackage(path),
        "Pacote de diagnóstico criado sem o banco financeiro.",
      );
  };
  const selectUpdate = async () => {
    const path = await chooseUpdate();
    if (path)
      await run(async () => {
        setUpdatePath(path);
        setUpdate(await inspectUpdate(path));
      }, "Assinatura, versão e instalador da atualização validados.");
  };
  const applyUpdate = async () => {
    if (
      !update ||
      !window.confirm(
        "Será criado um backup preventivo antes de abrir o instalador. Continuar?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const installer = await prepareUpdate(updatePath);
      setMessage(
        "Atualização preparada. O instalador será aberto e o aplicativo será encerrado.",
      );
      await installPreparedUpdate(installer);
    } catch (reason) {
      setError(String(reason));
      setBusy(false);
    }
  };
  const license = async () => {
    const path = await chooseLicense();
    if (path)
      await run(() => activateLicense(path), "Licença ativada com sucesso.");
  };

  return (
    <section className="mx-auto max-w-6xl py-8">
      <header>
        <p className="text-sm font-semibold text-brand">Fase 8</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">
          Segurança e continuidade
        </h1>
        <p className="mt-1 text-slate-600">
          Backups verificáveis, recuperação orientada, diagnóstico privado,
          licença e atualizações seguras.
        </p>
      </header>
      {overview && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={ShieldCheck}
            label="Integridade do banco"
            value={
              overview.databaseIntegrity === "ok" &&
              overview.foreignKeyViolations === 0
                ? "Íntegro"
                : "Requer atenção"
            }
          />
          <Metric
            icon={Archive}
            label="Último backup"
            value={
              overview.settings.lastBackupAt
                ? new Date(overview.settings.lastBackupAt).toLocaleString(
                    "pt-BR",
                  )
                : "Ainda não realizado"
            }
          />
          <Metric
            icon={HardDrive}
            label="Banco local"
            value={`${bytes(overview.databaseSizeBytes)} · migração ${overview.databaseVersion}`}
          />
          <Metric
            icon={FileHeart}
            label="Logs técnicos"
            value={`${overview.logFileCount} arquivo(s) · ${bytes(overview.logSizeBytes)}`}
          />
        </div>
      )}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel
          icon={DatabaseBackup}
          title="Backup manual"
          text="Inclui banco, configurações, logotipo, manifesto, versão, data e checksums."
        >
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={protect}
              onChange={(e) => setProtect(e.target.checked)}
            />
            Proteger este backup com senha
          </label>
          {protect && (
            <label className="mt-3 block text-xs font-semibold text-slate-600">
              Senha do backup
              <input
                aria-label="Senha do backup"
                type="password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                className={field}
              />
              <span className="mt-1 block font-normal">
                A senha não é armazenada e será necessária para restaurar.
              </span>
            </label>
          )}
          <button
            disabled={busy}
            onClick={() => void manualBackup()}
            className={`${button} mt-4 bg-brand text-white`}
          >
            <DatabaseBackup size={17} />
            Criar backup agora
          </button>
        </Panel>
        <Panel
          icon={RotateCcw}
          title="Restaurar backup"
          text="Valida antes de substituir, cria cópia preventiva, migra e registra auditoria."
        >
          <button
            disabled={busy}
            onClick={() => void selectBackup()}
            className={button}
          >
            <FolderOpen size={17} />
            Selecionar arquivo
          </button>
          {selectedPath && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3">
              <p
                className="truncate text-xs text-slate-500"
                title={selectedPath}
              >
                {selectedPath}
              </p>
              <label className="mt-2 block text-xs font-semibold">
                Senha, se houver
                <input
                  aria-label="Senha para restaurar"
                  type="password"
                  value={restorePassword}
                  onChange={(e) => {
                    setRestorePassword(e.target.value);
                    setSelected(null);
                  }}
                  className={field}
                />
              </label>
              <button
                disabled={busy}
                onClick={() => void validateBackup()}
                className={`${button} mt-3`}
              >
                <CheckCircle2 size={17} />
                Validar integridade
              </button>
              {selected && (
                <div className="mt-3 border-t border-slate-200 pt-3 text-sm">
                  <p className="font-bold">
                    {selected.businessName ?? "Empresa não identificada"}
                  </p>
                  <p className="text-slate-600">
                    {new Date(selected.generatedAtEpoch * 1000).toLocaleString(
                      "pt-BR",
                    )}{" "}
                    · versão {selected.appVersion} · {bytes(selected.sizeBytes)}
                  </p>
                  <p className="text-slate-600">
                    {selected.protected ? "Protegido por senha" : "Sem senha"}
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => void restore()}
                    className={`${button} mt-3 bg-attention text-white`}
                  >
                    Restaurar e reiniciar
                  </button>
                </div>
              )}
            </div>
          )}
        </Panel>
        <Panel
          icon={Archive}
          title="Backup automático"
          text="Executado localmente ao iniciar quando a frequência vencer; mantém somente a quantidade escolhida."
        >
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Ativar backups automáticos
          </label>
          <label className="mt-3 block text-xs font-semibold">
            Pasta
            <div className="mt-1 flex gap-2">
              <input
                aria-label="Pasta dos backups automáticos"
                value={directory}
                readOnly
                className={`${field} mt-0`}
              />
              <button onClick={() => void pickDirectory()} className={button}>
                <FolderOpen size={16} />
              </button>
            </div>
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold">
              Frequência
              <select
                aria-label="Frequência do backup"
                disabled={!enabled}
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className={field}
              >
                <option value="DAILY">Diária</option>
                <option value="WEEKLY">Semanal</option>
                <option value="MONTHLY">Mensal</option>
              </select>
            </label>
            <label className="text-xs font-semibold">
              Quantidade mantida
              <input
                aria-label="Quantidade de backups mantidos"
                type="number"
                min={1}
                max={120}
                value={retention}
                onChange={(e) => setRetention(Number(e.target.value))}
                className={field}
              />
            </label>
          </div>
          <button
            disabled={busy}
            onClick={() => void saveSettings()}
            className={`${button} mt-4 bg-ink text-white`}
          >
            Salvar política
          </button>
        </Panel>
        <Panel
          icon={Stethoscope}
          title="Diagnóstico e suporte"
          text="Gera versão, sistema, migrações, integridade e logs recentes. O banco financeiro não é incluído."
        >
          {overview && (
            <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
              <Info
                label="Sistema"
                value={`${overview.operatingSystem} ${overview.architecture}`}
              />
              <Info label="Aplicativo" value={overview.appVersion} />
              <Info
                label="Chaves estrangeiras"
                value={
                  overview.foreignKeyViolations === 0
                    ? "Sem violações"
                    : `${overview.foreignKeyViolations} violação(ões)`
                }
              />
              <Info label="Privacidade" value="Sem telemetria" />
            </dl>
          )}
          <button
            disabled={busy}
            onClick={() => void diagnostic()}
            className={button}
          >
            <Stethoscope size={17} />
            Gerar pacote de diagnóstico
          </button>
        </Panel>
        <Panel
          icon={RefreshCw}
          title="Atualizações"
          text="Aceita somente pacote assinado, versão mais nova e instalador com checksum válido."
        >
          <button
            disabled={busy}
            onClick={() => void selectUpdate()}
            className={button}
          >
            <Upload size={17} />
            Verificar pacote de atualização
          </button>
          {update && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-bold">Versão {update.version}</p>
              <p className="mt-1 text-slate-600">{update.summary}</p>
              <p className="mt-2 text-xs font-semibold">
                {update.licenseCompatible
                  ? "Licença compatível"
                  : "Nova licença necessária"}
              </p>
              <button
                disabled={busy || !update.licenseCompatible}
                onClick={() => void applyUpdate()}
                className={`${button} mt-3 bg-brand text-white`}
              >
                Criar backup e atualizar
              </button>
            </div>
          )}
        </Panel>
        <Panel
          icon={KeyRound}
          title="Assinatura e autorização offline"
          text="A assinatura é confirmada pelo servidor; uma autorização temporária assinada mantém o uso offline."
        >
          {status && (
            <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
              <Info label="Situação" value={status.licenseStatus === "ACTIVE" ? "Ativada" : status.trialExpired ? "Limite gratuito atingido" : "Teste gratuito"} />
              <Info
                label="Edição"
                value={status.licenseEdition ?? "Não ativada"}
              />
              <Info
                label="Cliente"
                value={status.licenseCustomer ?? "Não informado"}
              />
              <Info
                label="Versão autorizada"
                value={status.authorizedMajorVersion?.toString() ?? "—"}
              />
              <Info label="Código da instalação" value={status.installationId} />
              <Info label="Versão instalada" value={status.appVersion} />
              <Info label="Licença" value={status.licenseId ?? "Ainda não emitida"} />
              <Info label="Data de emissão" value={status.licenseIssuedAt ? new Date(status.licenseIssuedAt).toLocaleDateString("pt-BR") : "—"} />
              <Info label="Uso gratuito" value={`${status.trialUsageCount} de ${status.trialEntryLimit ?? 50}`} />
              <Info label="Modelo atual" value="Essencial mensal ou anual" />
            </dl>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => void license()}
              className={button}
            >
              Importar licença legada
            </button>
            <button
              disabled={!status}
              onClick={() =>
                status &&
                void navigator.clipboard
                  .writeText(status.installationId)
                  .then(() => setMessage("Código da instalação copiado."))
              }
              className={button}
            >
              <Copy size={16} />
              Copiar instalação
            </button>
            <a href="/configuracoes" className={`${button} bg-brand text-white`}>Ver planos e assinar</a>
          </div>
          <p className="mt-3 text-xs text-slate-500">A importação de .cnclic existe somente para clientes com licença emitida antes da migração para assinaturas.</p>
        </Panel>
      </div>
      {overview && (
        <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <header className="border-b border-slate-200 p-4">
            <h2 className="font-bold">Histórico de continuidade</h2>
            <p className="text-sm text-slate-500">
              Últimos backups manuais, automáticos, preventivos e falhas.
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Proteção</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Arquivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">
                      Nenhum evento registrado.
                    </td>
                  </tr>
                ) : (
                  overview.history.map((item) => (
                    <tr key={item.id}>
                      <td className="whitespace-nowrap px-4 py-3">
                        {new Date(item.createdAt).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3">
                        {{
                          MANUAL: "Manual",
                          AUTOMATIC: "Automático",
                          PREVENTIVE: "Preventivo",
                        }[item.backupType] ?? item.backupType}
                      </td>
                      <td className="px-4 py-3">
                        {item.protected ? "Com senha" : "Sem senha"}
                      </td>
                      <td className="px-4 py-3">
                        {item.status === "SUCCESS"
                          ? "Concluído"
                          : `Falhou: ${item.errorSummary ?? "erro técnico"}`}
                      </td>
                      <td
                        className="max-w-xs truncate px-4 py-3 text-slate-500"
                        title={item.path}
                      >
                        {item.path}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {message && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-positive"
        >
          {message}
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
  );
}

function Panel({
  icon: Icon,
  title,
  text,
  children,
}: {
  icon: typeof Archive;
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-surface">
      <Icon className="text-brand" />
      <h2 className="mt-3 text-lg font-bold">{title}</h2>
      <p className="mb-4 mt-1 text-sm leading-6 text-slate-600">{text}</p>
      {children}
    </article>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Archive;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <Icon size={19} className="text-brand" />
      <p className="mt-2 text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-ink">{value}</p>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="break-words font-semibold text-ink">{value}</dd>
    </div>
  );
}
