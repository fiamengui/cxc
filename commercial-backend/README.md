# Backend comercial do CaixaSimples - Bratec

Serviço independente do instalador. Mantém preços, clientes, instalações, assinaturas, pagamentos, webhooks e emissão restrita de entitlements. Segredos do Mercado Pago e a chave privada Ed25519 existem apenas no ambiente do servidor.

1. Crie PostgreSQL separado e execute migrations versionadas com `npm run migrate` (não aplique SQL manualmente em produção).
2. Copie `.env.example` para um gerenciador de segredos; não versione `.env`.
3. Crie no Mercado Pago as referências recorrentes mensal de R$ 9,90 e anual de R$ 99,90 e configure seus IDs para reconciliação. O checkout hospedado envia preço e periodicidade pelo catálogo do servidor, sem `preapproval_plan_id`, pois a associação direta exige tokenização de cartão.
4. Configure o webhook HTTPS em `/v1/webhooks/mercado-pago`.
5. Execute `npm ci`, `npm test`, `npm run build` e `npm start`.

Em produção, configure uma URL Neon pooled em `DATABASE_URL`, uma URL direta em `DATABASE_DIRECT_URL`, SSL `verify-full` e execute `npm run migrate:production`. Consulte `docs/production-infrastructure.md` para o procedimento completo e os limites de responsabilidade entre runtime e migration.

O retorno do checkout não ativa o produto. Somente webhook autenticado, seguido de consulta server-to-server ao Mercado Pago, pode atualizar a assinatura. O endpoint de entitlement exige desafio assinado pela chave do dispositivo e aceita o nonce uma única vez.
