const genericMessage =
  "Não foi possível concluir esta ação. Tente novamente e, se o problema continuar, gere um diagnóstico em Backup.";

export function toUserMessage(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason ?? "");
  const message = raw.replace(/^(?:Error|TypeError|RangeError):\s*/i, "").trim();

  if (!message) return genericMessage;
  if (
    /__TAURI_INTERNALS__|cannot read properties of undefined.*invoke|comando não simulado/i.test(
      message,
    )
  ) {
    return "A integração local não está disponível nesta prévia. Abra o aplicativo instalado para acessar seus dados.";
  }
  if (/database is locked|database table is locked|SQLITE_BUSY/i.test(message)) {
    return "O banco de dados está ocupado por outra operação. Aguarde alguns segundos e tente novamente.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Não foi possível carregar os dados agora. Verifique a conexão e tente novamente.";
  }
  if (/^\w*(?:exception|error)\b|stack trace|at \w+\s*\(/i.test(message)) {
    return genericMessage;
  }
  return message.length > 320 ? genericMessage : message;
}
