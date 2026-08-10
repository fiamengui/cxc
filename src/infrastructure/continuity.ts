import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { exit, relaunch } from "@tauri-apps/plugin-process";
import { openPath } from "@tauri-apps/plugin-opener";

export type Phase2Status = {
  appVersion: string;
  licenseStatus: string;
  licenseEdition: string | null;
  licenseCustomer: string | null;
  authorizedMajorVersion: number | null;
  installationId: string;
  licenseId: string | null;
  licenseIssuedAt: string | null;
  licenseProduct: string | null;
  licenseSchemaVersion: number | null;
  enabledFeatures: string[];
  canCreateFinancialOperation: boolean;
  demoDataLoaded: boolean;
  trialExpired: boolean;
  trialEndsAt: string | null;
  trialEntryLimit: number | null;
  trialUsageCount: number;
  trialRemainingEntries: number | null;
  subscriptionState: string;
  subscriptionPlanCode: string | null;
  subscriptionValidUntil: string | null;
  subscriptionRequiresOnlineValidation: boolean;
};
export type BackupInfo = { path: string; businessName: string | null; appVersion: string; generatedAtEpoch: number; checksum: string; protected: boolean; sizeBytes: number };
export type BackupSettings = { directory: string | null; enabled: boolean; frequency: string; retentionCount: number; lastBackupAt: string | null; due: boolean };
export type BackupHistoryItem = { id: string; backupType: string; path: string; protected: boolean; status: string; sizeBytes: number | null; errorSummary: string | null; createdAt: string };
export type ContinuityOverview = { settings: BackupSettings; history: BackupHistoryItem[]; databaseVersion: number; databaseSizeBytes: number; databaseIntegrity: string; foreignKeyViolations: number; logFileCount: number; logSizeBytes: number; appVersion: string; operatingSystem: string; architecture: string };
export type UpdateInfo = { currentVersion: string; version: string; publishedAt: string; summary: string; majorUpgrade: boolean; licenseCompatible: boolean; installerFileName: string };
export const getPhase2Status = () => invoke<Phase2Status>("phase2_status");
export const activateLicense = (path: string) => invoke<Phase2Status>("activate_license_file", { path });
export const loadDemoData = () => invoke<Phase2Status>("load_demo_data");
export const removeDemoData = () => invoke<Phase2Status>("remove_demo_data");
export const createBackup = (path: string, password: string | null) => invoke<BackupInfo>("create_backup", { path, password });
export const inspectBackup = (path: string, password: string | null) => invoke<BackupInfo>("inspect_backup", { path, password });
export const restoreBackup = (path: string, password: string | null) => invoke<BackupInfo>("restore_backup", { path, password });
export const getContinuityOverview = () => invoke<ContinuityOverview>("continuity_overview");
export const saveBackupSettings = (input: { directory: string | null; enabled: boolean; frequency: string; retentionCount: number }) => invoke<BackupSettings>("save_backup_settings", { input });
export const runAutomaticBackup = () => invoke<BackupInfo | null>("run_automatic_backup");
export const createDiagnosticPackage = (path: string) => invoke<void>("create_diagnostic_package", { path });
export const inspectUpdate = (path: string) => invoke<UpdateInfo>("inspect_update", { path });
export const prepareUpdate = (path: string) => invoke<string>("prepare_update", { path });
export const relaunchApplication = () => relaunch();
export async function chooseLicense() { const value = await open({ multiple: false, filters: [{ name: "Licença Caixa no Controle", extensions: ["cnclic"] }] }); return typeof value === "string" ? value : null; }
export async function chooseBackup() { const value = await open({ multiple: false, filters: [{ name: "Backup Caixa no Controle", extensions: ["cncbak"] }] }); return typeof value === "string" ? value : null; }
export async function chooseBackupDestination() { const stamp=new Date().toISOString().slice(0,16).replaceAll(":","").replace("T","_"); return save({ defaultPath: `CaixaNoControle_${stamp}.cncbak`, filters: [{ name: "Backup Caixa no Controle", extensions: ["cncbak"] }] }); }
export async function chooseBackupDirectory() { const value = await open({ directory: true, multiple: false }); return typeof value === "string" ? value : null; }
export async function chooseDiagnosticDestination() { return save({ defaultPath: `Diagnostico_CaixaNoControle_${new Date().toISOString().slice(0,10)}.cncdiag`, filters: [{ name: "Diagnóstico Caixa no Controle", extensions: ["cncdiag"] }] }); }
export async function chooseUpdate() { const value = await open({ multiple: false, filters: [{ name: "Atualização Caixa no Controle", extensions: ["cncupd"] }] }); return typeof value === "string" ? value : null; }
export async function installPreparedUpdate(installerPath: string) { await openPath(installerPath); await exit(0); }
