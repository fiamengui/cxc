import { invoke } from "@tauri-apps/api/core";

export type DatabaseStatus = { migrationVersion: number };

export function getDatabaseStatus(): Promise<DatabaseStatus> {
  return invoke<DatabaseStatus>("database_status");
}
