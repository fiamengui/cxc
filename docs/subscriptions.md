# Assinaturas

Estados: `PAYMENT_PENDING`, `ACTIVE`, `GRACE_PERIOD`, `PAYMENT_FAILED`, `EXPIRED`, `CANCELED` e `REFUNDED`. Somente `ACTIVE` e `GRACE_PERIOD` emitem entitlement. Um pagamento aprovado inicia período mensal/anual calculado no servidor. Falha após período ativo pode entrar na tolerância do plano; falha inicial não concede acesso.

O botão **Verificar pagamento** executa challenge-response e não confia no navegador. Enquanto o backend estiver indisponível, um lease válido continua funcionando; sem lease válido, o sistema fica em leitura, preservando dashboard, consultas, relatórios, exportações e backup. Cancelamento ou reembolso nunca apaga dados.

A troca mensal → anual deve ser feita criando a nova assinatura no provedor e encerrando a anterior segundo a política comercial. A versão atual não executa prorrata automática.
