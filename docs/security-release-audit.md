# Auditoria de segurança da release comercial

Data: 2026-08-07. Escopo: frontend React, comandos Tauri/Rust, estado local, backend comercial e pipeline de distribuição.

## Resultado

- CRITICAL: 0 conhecidos no código auditado.
- HIGH: 0 conhecidos após atualizar Fastify para 5.11.2; `npm audit --omit=dev` do backend retorna zero.
- MEDIUM: rate limit local não é compartilhado entre réplicas; resolver com WAF/Redis antes de escalar horizontalmente. A chave PEM em arquivo é aceitável apenas para implantação inicial controlada; migrar para KMS/HSM.
- LOW: certificate pinning não implementado pelo risco operacional de rotação; manter avaliação periódica. Ofuscação não foi adotada por não acrescentar confiança criptográfica.

## Verificações

Não foram encontrados comandos genéricos de SQL/shell nem bypass de licença. CSP não permite script remoto nem `unsafe-eval`. ACL do opener foi reduzida aos domínios Mercado Pago e ao diretório de atualização. Produção rejeita HTTP e não lê variável runtime para trocar API. Logs redigem autorização, webhook, e-mail, documento e assinaturas. Segredos aparecem somente como nomes/valores fictícios em `.env.example`.

## Pendências externas para venda

Auditoria não valida infraestrutura inexistente. Antes de produção são obrigatórios deploy HTTPS, PostgreSQL gerenciado, secret manager, credenciais e planos reais do Mercado Pago, webhook público, teste sandbox real, certificado Authenticode e assinatura efetiva dos binários. Até esses itens existirem, o artefato é candidato técnico, não release vendável.
