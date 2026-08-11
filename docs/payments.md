# Pagamentos

O checkout é hospedado pelo Mercado Pago; o Tauri nunca coleta cartão. O frontend envia somente plano, identificação de cobrança e identidade pública ao comando Rust. O Rust chama o backend HTTPS, que seleciona preço e periodicidade no catálogo do servidor e cria `/preapproval` sem plano associado, com `auto_recurring`. A URL retornada só é aberta se pertencer ao domínio HTTPS do Mercado Pago.

O fluxo hospedado não envia `preapproval_plan_id`: o Mercado Pago exige `card_token_id` e autorização imediata quando a assinatura é associada a um plano. Como o CaixaSimples não coleta nem tokeniza cartão, os planos mensal e anual provisionados são referências comerciais auditáveis; o checkout usa os mesmos valores e frequências, escolhidos exclusivamente no servidor.

O redirect de retorno nunca ativa o produto. O webhook precisa ter `x-signature`, `x-request-id`, timestamp dentro de cinco minutos e ID do recurso. Após validar HMAC, o backend consulta novamente `/preapproval/{id}` ou `/v1/payments/{id}` com credencial server-to-server. Evento e pagamento são idempotentes por IDs únicos.

Para sandbox, crie as referências mensal e anual com 990 e 9990 centavos, registre seus IDs e use apenas credenciais da conta vendedora de teste. Produção usa banco, domínio, webhook, token, secret e chave de entitlement separados.
