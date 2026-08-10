# Backend comercial do Caixa no Controle

Serviço independente do instalador. Mantém preços, clientes, instalações, assinaturas, pagamentos, webhooks e emissão restrita de entitlements. Segredos do Mercado Pago e a chave privada Ed25519 existem apenas no ambiente do servidor.

1. Crie PostgreSQL e execute `migrations/0001_commercial.sql`.
2. Copie `.env.example` para um gerenciador de segredos; não versione `.env`.
3. Crie no Mercado Pago os planos recorrentes mensal de R$ 9,90 e anual de R$ 99,90 e configure seus IDs.
4. Configure o webhook HTTPS em `/v1/webhooks/mercado-pago`.
5. Execute `npm ci`, `npm test`, `npm run build` e `npm start`.

O retorno do checkout não ativa o produto. Somente webhook autenticado, seguido de consulta server-to-server ao Mercado Pago, pode atualizar a assinatura. O endpoint de entitlement exige desafio assinado pela chave do dispositivo e aceita o nonce uma única vez.
