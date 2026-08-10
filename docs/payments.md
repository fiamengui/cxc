# Pagamentos

O checkout é hospedado pelo Mercado Pago; o Tauri nunca coleta cartão. O frontend envia somente plano, identificação de cobrança e identidade pública ao comando Rust. O Rust chama o backend HTTPS, que seleciona o plano e cria `/preapproval` com token mantido no servidor. A URL retornada só é aberta se pertencer ao domínio HTTPS do Mercado Pago.

O redirect de retorno nunca ativa o produto. O webhook precisa ter `x-signature`, `x-request-id`, timestamp dentro de cinco minutos e ID do recurso. Após validar HMAC, o backend consulta novamente `/preapproval/{id}` ou `/v1/payments/{id}` com credencial server-to-server. Evento e pagamento são idempotentes por IDs únicos.

Para sandbox, crie dois planos de recorrência com 990 e 9990 centavos, configure seus IDs e use apenas credenciais sandbox no backend sandbox. Produção usa banco, domínio, webhook, token, secret e chave de entitlement separados.
