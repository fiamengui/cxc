import { invoke } from "@tauri-apps/api/core";

export async function openUserManual(): Promise<void> {
  await invoke<void>("open_user_manual");
}

export const applicationVersion = "1.2.0-beta.1";
