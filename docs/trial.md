# Modo demonstrativo

## Regra

Uma instalação sem licença pode criar **50 operações financeiras/comerciais**, sem prazo de expiração. A interface apresenta `X de 50 movimentações gratuitas utilizadas`. A 50ª operação é aceita; a 51ª retorna uma mensagem orientando a ativação e o estado público passa a `TRIAL_LIMIT_REACHED`.

Cada ação de alto nível conta uma vez:

- receita, despesa, aporte, retirada ou ajuste;
- transferência, ainda que produza uma saída e uma entrada;
- venda confirmada, mesmo que produza várias parcelas;
- cada ocorrência financeira realmente gerada por uma recorrência.

Não consomem o limite: clientes, fornecedores, categorias, produtos, serviços, configurações, metas, consultas, relatórios, impressão, exportação, backup e preferências.

## Depois de 50

Nenhum dado é apagado ou movido. Login, dashboard, consultas, relatórios, impressão, exportação, backup, restauração, configurações, ajuda e tela de licença continuam acessíveis. O guard central do backend bloqueia somente a criação de novas operações financeiras; a proteção não depende de botões desabilitados no React.

## Persistência e restauração

O contador corrente existe em `app_license.trial_usage_count`, mas o maior valor já observado também é persistido no estado comercial local descrito em `docs/licensing.md`. Depois de restauração ou reinstalação comum, o maior valor prevalece. Assim, restaurar um backup feito em 49 não reduz um consumo que já chegou a 50.

O contador externo continua protegendo contra restauração casual. Alterar SQLite para `ACTIVE` não concede direito: na reconciliação, somente uma licença legada Ed25519 válida ou um entitlement temporário assinado pode ativar escritas. A identidade e o estado comercial antirrollback usam DPAPI e ficam fora do backup empresarial.

## Recursos centralizados

O serviço de entitlement centraliza `can_create_financial_operation`, `can_use_feature` e `get_current_edition`. Os nomes preparados são `financial_core`, `contacts`, `catalog`, `sales`, `reports`, `backup`, `goals`, `professional_features`, `inventory` e `multi_user`. Trial e Essencial usam o conjunto essencial atual.
