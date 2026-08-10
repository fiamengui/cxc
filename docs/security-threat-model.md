# Modelo de ameaças comercial

## Ativos e fronteiras

Ativos críticos: token e webhook secret do Mercado Pago, chave privada de entitlement, dados PostgreSQL, chave privada do dispositivo e certificado de assinatura de código. As fronteiras são WebView→Rust, desktop→backend HTTPS, backend→Mercado Pago e backend→cofre de chaves/PostgreSQL.

## Ameaças e controles

| Ameaça | Controle principal |
|---|---|
| alterar preço no frontend | plano/preço imutáveis no backend e conferência do valor pago |
| forjar webhook | HMAC, janela temporal, consulta server-to-server e idempotência |
| repetir challenge/entitlement | nonce hash de uso único, expiração, request ID e sequência monotônica |
| copiar backup/SQLite | identidade fora do backup, DPAPI e vínculo ao fingerprint público |
| editar `subscription_status` local | reconciliação aceita somente documento Ed25519 válido |
| retroceder relógio/estado | horário confiável e maior sequência dentro do estado DPAPI |
| roubar segredo do cliente | nenhum segredo de pagamento ou assinatura no cliente |
| abuso de endpoint | UUIDs, mensagens reduzidas, limite por IP/rota e tamanho de corpo |

## Riscos residuais

Um administrador local pode modificar o binário e contornar verificações apenas naquela cópia, mas não consegue criar entitlement válido, falsificar pagamento no backend nem assumir a chave DPAPI de outro usuário sem comprometer sistemas adicionais. Rate limit em memória deve migrar para Redis/WAF em múltiplas instâncias. Certificate pinning não foi ativado: sem operação segura de rotação, pin rígido aumenta o risco de bloquear todos os clientes; HTTPS, cadeia pública e assinatura de payload permanecem obrigatórios.

Em comprometimento: revogar/rotacionar o segredo afetado, suspender emissão, preservar logs, auditar eventos, publicar nova chave pública em release assinada quando necessário e comunicar clientes. Chave de code signing comprometida exige revogação junto à autoridade certificadora.
