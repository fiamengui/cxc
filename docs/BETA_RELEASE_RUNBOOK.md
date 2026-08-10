# Runbook da beta controlada

## Antes da beta

1. Confirmar o projeto Neon de produção separado, restore testado, connection string pooled para runtime e direta para migrations.
2. Injetar todos os secrets listados em `production-infrastructure.md` no Render; nunca copiá-los para o Git ou para o desktop.
3. Executar `npm ci`, `npm run build`, `npm test` e `npm run migrate:production` em `commercial-backend`.
4. Validar `GET /health` e `GET /health/database` na URL HTTPS pública.
5. Confirmar `NODE_ENV=production`, `RELEASE_CHANNEL=beta`, `BETA_MODE=true` e `BETA_MAX_CUSTOMERS=5`.
6. Confirmar token, webhook e IDs dos dois planos Mercado Pago de produção.
7. Compilar o desktop com `CNC_COMMERCIAL_API_URL` apontando para a URL pública verificada.
8. Gerar instaladores, hashes, manifesto e executar o smoke test em Windows limpo.

## Adicionar cliente beta

O código de convite é exibido uma única vez e só deve ser enviado ao e-mail reservado. O banco armazena apenas HMAC do código.

```powershell
$env:COMMERCIAL_PUBLIC_URL='https://caixasimples-bratec-api.onrender.com'
$env:BETA_ADMIN_TOKEN='<carregado do cofre>'
npm run beta:admin -- invite cliente@exemplo.com "Piloto autorizado"
npm run beta:admin -- list
```

Cada convite reserva definitivamente uma das cinco vagas. Encerrar, suspender ou converter um registro não abre nova vaga automaticamente. Para alterar a capacidade é necessária uma decisão administrativa explícita e mudança de `BETA_MAX_CUSTOMERS`.

O cliente informa nome, o mesmo e-mail do convite e o código em **Meu plano → Ativar convite beta**. A autorização é vinculada à instalação e recebe entitlement Ed25519 `BETA`, renovável e com tolerância offline de 14 dias.

## Administração

```powershell
npm run beta:admin -- status <UUID> SUSPENDED "Motivo administrativo"
npm run beta:admin -- status <UUID> ACTIVE "Reativado"
npm run beta:admin -- status <UUID> CONVERTED "Migrou para plano comercial"
npm run beta:admin -- status <UUID> CLOSED "Beta encerrada"
```

Status permitidos: `INVITED`, `ACTIVE`, `SUSPENDED`, `CONVERTED` e `CLOSED`. Revogação online impede a próxima renovação; um dispositivo offline conserva somente o lease já assinado até seu vencimento.

## Suporte

- Solicitar o pacote `.cncdiag` gerado na tela Backup.
- Conferir versão, sistema, arquitetura, Installation ID e erros sanitizados.
- Nunca solicitar senha, banco financeiro completo, token, chave privada ou dados de cartão.
- O contato de feedback deve ser configurado e validado pela BratecInfo antes da entrega; o repositório não inventa endereço de suporte.

## Rollback

- Backend: retornar à imagem anterior do Render sem reverter migrations destrutivamente.
- Banco: criar branch/restore do Neon a partir do ponto confirmado e validar antes de trocar a connection string.
- Desktop: manter o instalador anterior; como downgrade é bloqueado, qualquer correção deve receber versão superior.
- Mercado Pago: não apagar assinaturas; desabilitar novos checkouts no backend e tratar contratos existentes conforme política comercial.

## Encerrar a beta

1. Bloquear novos convites mantendo os registros existentes.
2. Comunicar condições e datas antes de qualquer conversão comercial.
3. Marcar individualmente `CONVERTED` ou `CLOSED`; não apagar clientes.
4. Preservar auditoria, backups e acesso aos dados locais do cliente.
5. Não prometer gratuidade permanente nem executar cobrança sem consentimento explícito.
