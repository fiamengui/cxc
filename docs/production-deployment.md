# Implantação comercial de produção

O backend é distribuído pela imagem de `commercial-backend/Dockerfile`, executada como usuário sem privilégios. A inicialização aplica migrations sob advisory lock; cada migration aplicada fica registrada com SHA-256 e não pode ser alterada retroativamente.

## Infraestrutura escolhida para homologação

A homologação usa Render Free para o container e Neon Free para PostgreSQL. O Blueprint em `render.yaml` cria somente o Web Service gratuito; o banco já existe no Neon em São Paulo e exige conexão TLS com `DATABASE_SSL_MODE=verify-full`. O Render fornece domínio `onrender.com`, TLS gerenciado, healthcheck HTTP em `/health` e Secrets. A chave Ed25519 é codificada em base64 localmente e injetada exclusivamente pelo Secret `ENTITLEMENT_PRIVATE_KEY_BASE64`.

Os planos gratuitos reduzem a zero quando ficam ociosos e não possuem o mesmo compromisso de disponibilidade de uma instância paga. Eles são adequados para integração e matriz sandbox, mas não constituem a infraestrutura comercial final. Antes da primeira venda, o serviço deve ser promovido para uma instância sem suspensão automática e a política de backup/restauração do banco deve ser validada.

## Infraestrutura mínima

- PostgreSQL gerenciado, com TLS, backup e restauração testada;
- serviço de containers com HTTPS na borda, healthcheck em `/health` e uma instância durante o lançamento;
- DNS dedicado, por exemplo `commercial.<domínio-da-BratecInfo>`;
- secret manager capaz de injetar a chave Ed25519 por arquivo somente leitura ou variável secreta em base64;
- WAF/rate limit compartilhado antes de escalar para mais de uma réplica.

Não publicar diretamente a porta 8080. O proxy deve terminar TLS, encaminhar ao container em rede privada e preservar apenas cabeçalhos necessários. O banco não deve ser publicamente acessível.

## Secrets

Configurar somente no serviço de backend:

- `DATABASE_URL`;
- `MERCADO_PAGO_ACCESS_TOKEN`;
- `MERCADO_PAGO_WEBHOOK_SECRET`;
- `MERCADO_PAGO_MONTHLY_PLAN_ID`;
- `MERCADO_PAGO_ANNUAL_PLAN_ID`;
- `ENTITLEMENT_PRIVATE_KEY_PATH`;
- `ENTITLEMENT_KEY_ID`.

Configurar também `NODE_ENV=production`, `HOST=0.0.0.0`, `COMMERCIAL_ENVIRONMENT=production`, `COMMERCIAL_PUBLIC_URL` e `ALLOWED_APP_ORIGIN`. Nunca usar `.env` dentro da imagem.

## Ordem de liberação

1. criar o projeto Neon, guardar a connection string como Secret e executar `npm run migrate` pela imagem aprovada;
2. publicar a imagem e validar HTTPS/healthcheck;
3. criar ou reconciliar os planos recorrentes no Mercado Pago com `npm run provision:plans` dentro de `commercial-backend`; o script é idempotente por `external_reference` e valida preço, frequência e URL de retorno;
4. inserir IDs, token e webhook secret no secret manager;
5. registrar `https://<host>/v1/webhooks/mercado-pago` no painel Mercado Pago;
6. executar a matriz sandbox e guardar evidências sem dados de cartão;
7. promover credenciais e banco separados para produção;
8. executar `scripts/verify-production-readiness.ps1`;
9. gerar a release com `scripts/build-production-release.ps1`;
10. validar em Windows limpo antes da publicação.

Uma release que não apresente assinatura Authenticode `Valid` ou que tenha sido compilada com host local/fictício é rejeitada pelos scripts.
