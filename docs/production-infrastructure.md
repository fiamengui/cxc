# Infraestrutura de produção da beta

## Separação obrigatória

A beta usa infraestrutura de produção, mas permanece no canal de software `beta`. Desenvolvimento e testes não podem compartilhar banco, credenciais Mercado Pago nem chave privada com produção.

| Ambiente | Banco | Pagamentos | Canal |
| --- | --- | --- | --- |
| Desenvolvimento | PostgreSQL local ou Neon não produtivo | sandbox | development |
| Teste | PostgreSQL descartável | sandbox/mocks | development |
| Produção beta | projeto Neon `caixasimples-bratec-production` | production | beta |

Os arquivos `.env.*.example` são somente contratos de configuração. Valores reais devem existir apenas nos secrets do Render/Neon e nunca no Git, no instalador ou no aplicativo.

## Neon de produção

1. Criar projeto separado chamado `caixasimples-bratec-production`, na região mais próxima do Render.
2. Criar uma role de runtime com privilégios mínimos nas tabelas da aplicação e uma role de migration separada.
3. Usar a connection string pooled da role de runtime em `DATABASE_URL`.
4. Usar a connection string direta da role de migration em `DATABASE_DIRECT_URL`.
5. Manter `DATABASE_SSL_MODE=verify-full`.
6. Antes do primeiro deploy, executar `npm ci`, `npm run build` e `npm run migrate:production` no backend com os secrets de produção injetados.
7. Confirmar no painel do Neon retenção, restore/branch de recuperação e exportação periódica compatíveis com o plano disponível.

O processo versionado adquire advisory lock, registra SHA-256 de cada migration, recusa migration histórica alterada e executa cada nova migration em transação. Em 10/08/2026 ele foi validado em PostgreSQL 17 vazio e reaplicado de forma idempotente.

## Render de produção

O blueprint `render.yaml` prepara o serviço gratuito `caixasimples-bratec-api`, com build Docker, start pelo `CMD` do Dockerfile, migration antes do servidor, `NODE_ENV=production`, canal `beta` e auto deploy desligado.

- URL pretendida: `https://caixasimples-bratec-api.onrender.com`
- Health superficial: `GET /health`
- Health com banco: `GET /health/database`
- Build: Dockerfile do diretório `commercial-backend`
- Start: `npm run migrate && npm start`, definido no Dockerfile

O blueprint não contém credenciais nem IDs de planos. Todos os campos marcados `sync: false` precisam ser preenchidos manualmente no Render. Só promover o serviço após confirmar que as URLs, planos e tokens são de produção.

## Secrets de produção

- `DATABASE_URL`
- `DATABASE_DIRECT_URL`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`
- `MERCADO_PAGO_MONTHLY_PLAN_ID`
- `MERCADO_PAGO_ANNUAL_PLAN_ID`
- `ENTITLEMENT_PRIVATE_KEY_BASE64`
- `BETA_ADMIN_TOKEN`
- `BETA_INVITE_PEPPER`

As demais variáveis não secretas estão declaradas no blueprint. A chave privada Ed25519 deve ser gerada fora do repositório e guardada no cofre de secrets da plataforma. Apenas a chave pública correspondente entra no aplicativo.

## Promoção segura

Antes de alterar o serviço externo: confirmar backup/restore do Neon, executar migrations, validar `/health/database`, conferir que não há credenciais sandbox, registrar o webhook HTTPS no Mercado Pago e só então compilar o desktop com a URL pública confirmada.
