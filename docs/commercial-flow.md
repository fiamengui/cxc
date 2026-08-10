# Fluxo comercial

```text
Trial (50 operações)
→ escolha mensal/anual
→ backend fixa preço
→ checkout hospedado Mercado Pago
→ webhook autenticado
→ consulta server-to-server
→ assinatura atualizada
→ challenge assinado pelo dispositivo
→ entitlement Ed25519 temporário
→ uso online/offline dentro do lease
→ renovação periódica
```

Endpoints: `GET /v1/plans`, `POST /v1/checkout`, `POST /v1/webhooks/mercado-pago`, `POST /v1/installations/challenge`, `POST /v1/entitlements/refresh` e `GET /health`. Migração PostgreSQL: `commercial-backend/migrations/0001_commercial.sql`.
