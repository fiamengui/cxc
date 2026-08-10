export function backupPasswordError(password: string) {
  const length = [...password].length;
  if (length < 8) return "A senha do backup deve possuir pelo menos 8 caracteres.";
  if (length > 256) return "A senha do backup deve possuir no máximo 256 caracteres.";
  return null;
}

export function continuityHealth(integrity: string, foreignKeyViolations: number) {
  return integrity === "ok" && foreignKeyViolations === 0 ? "HEALTHY" : "ATTENTION";
}

export function updateLicenseMessage(majorUpgrade: boolean, compatible: boolean) {
  if (compatible) return majorUpgrade ? "Nova versão principal autorizada pela licença." : "Atualização incluída na versão principal atual.";
  return "A licença atual não autoriza esta versão principal.";
}
