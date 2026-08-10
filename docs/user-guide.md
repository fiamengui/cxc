# Manual do usuário — Caixa no Controle 1.0

O Caixa no Controle é um aplicativo desktop da BratecInfo para organizar as finanças de pequenos negócios. Ele funciona offline e mantém o banco de dados no computador.

## Instalação

1. No Windows 10 ou 11 de 64 bits, execute `Caixa no Controle_1.1.0_x64-setup.exe`.
2. Leia e aceite o contrato de licença.
3. Confirme a pasta sugerida. O instalador cria o atalho no menu Iniciar e oferece um atalho opcional na área de trabalho.
4. Se o WebView2 não estiver presente, o instalador offline inclui a dependência.
5. Abra o Caixa no Controle pelo menu Iniciar.

O instalador pode aparecer como “Editor desconhecido” enquanto não houver certificado comercial de assinatura de código. Verifique sempre o SHA-256 publicado junto ao release.

## Primeiro acesso

O assistente solicita dados da empresa, tipo do negócio, regime padrão, conta e saldo inicial, categorias, formas de pagamento, meta opcional e usuário administrador. A senha deve ter ao menos 12 caracteres e permanece protegida com Argon2id.

O modo demonstração é independente dos dados demonstrativos. Ele permite 50 operações financeiras, sem expiração por data. Parcelamentos, vendas parceladas e transferências contam uma única vez por ação. Depois do limite, consultas, relatórios, exportações e backups continuam disponíveis; os registros são preservados após a ativação.

## Dados demonstrativos

O pacote demonstrativo inclui cliente, fornecedor, dois itens de catálogo, receitas e despesas pagas e pendentes e uma venda parcelada. Acesse **Configurações > Dados demonstrativos** para carregar ou remover o pacote. A remoção afeta apenas registros identificados como demonstração.

## Cadastros

- Em **Clientes e fornecedores**, registre nome, papéis, documento, contatos, endereço, observações e etiquetas.
- Em **Produtos e serviços**, informe tipo, código, preço de venda, custo e unidade.
- Em **Cadastros básicos**, mantenha categorias, contas financeiras e formas de pagamento.

O sistema alerta sobre possíveis duplicidades e usa exclusão lógica nos dados de negócio.

## Movimentações financeiras

Em **Movimentações**, registre receitas, despesas, aportes, retiradas, ajustes e recorrências. Valores são armazenados em centavos; nunca como ponto flutuante.

Em **Contas a receber** e **Contas a pagar**, acompanhe vencimentos e faça liquidação total ou parcial. Juros, multa, desconto e taxa compõem a liquidação com rastreabilidade. Cancelamentos e estornos exigem motivo.

Em **Fluxo de caixa**, consulte saldos por conta, entradas, saídas e projeção. Transferências movimentam duas contas e não são tratadas como faturamento ou despesa.

## Vendas

Cadastre o cliente e os itens antes de criar uma venda. A confirmação pode gerar recebimento imediato, futuro, parcelado ou misto. Vendas futuras e parceladas criam automaticamente as contas a receber vinculadas. O cancelamento respeita os recebimentos já existentes e mantém auditoria.

## Gestão e relatórios

A **Visão geral** resume saldo, receitas, despesas, resultado, contas vencidas e próximas obrigações. Em **Metas**, defina objetivos mensais de receita, despesa, resultado, vendas e novos clientes.

Em **Relatórios**, selecione o relatório, período, regime de caixa ou competência e filtros. A prévia pode ser exportada em CSV ou PDF. O sistema oferece relatórios financeiros, comerciais, cadastrais e de gestão.

## Backup e restauração

Em **Backup**, escolha uma pasta fora do computador sempre que possível, configure frequência e retenção e crie uma cópia manual. A proteção por senha usa Argon2id e criptografia autenticada. Guarde a senha: ela não pode ser recuperada.

Antes de restaurar, o sistema valida formato, checksum, integridade do SQLite, vínculos e versão das migrações. Uma cópia preventiva é criada antes da substituição e o aplicativo reinicia ao concluir.

## Licença offline

Em **Configurações → Meu plano**, escolha Mensal (R$ 9,90/mês) ou Anual (R$ 99,90/ano). O pagamento abre no Mercado Pago. Depois de pagar, volte e selecione **Verificar pagamento**. A autorização assinada permite uso offline por prazo limitado e é renovada quando houver internet. A importação `.cnclic` permanece apenas para licenças legadas já emitidas.

## Atualizações

Faça um backup, feche atividades em andamento e use apenas pacotes `.cncupd` emitidos pela BratecInfo. O sistema confere assinatura, checksum, versão do banco e compatibilidade da licença antes de preparar a atualização. A instalação por cima preserva o banco.

## Desinstalação

O desinstalador preserva o banco e as configurações por padrão. Em uma pergunta separada, escolha **Não** para manter os dados ou **Sim** para removê-los permanentemente. Faça um backup antes de escolher a remoção.

## Solução de problemas

- Se o aplicativo não abrir, reinicie o Windows e confirme que o antivírus não isolou o executável.
- Se uma ação falhar, leia a mensagem apresentada e revise campos obrigatórios, datas e valores.
- Se o banco apresentar alerta, não edite o arquivo manualmente; abra **Backup** e gere um pacote de diagnóstico.
- O pacote de diagnóstico exclui o banco financeiro, senhas e chaves privadas.
- Para suporte, informe a versão, o Windows, os passos para reproduzir e anexe o diagnóstico somente se desejar.

## Atalhos e acessibilidade

Use `Tab` e `Shift+Tab` para navegar, `Enter` ou `Espaço` para ativar controles e `Esc` para fechar diálogos. O aplicativo possui foco visível, rótulos acessíveis, contraste revisado e adaptação para zoom e telas compactas.

## Onde os dados ficam

- Banco: `%APPDATA%\br.com.bratecinfo.caixanocontrole\caixa-no-controle.db`
- Logs: `%LOCALAPPDATA%\br.com.bratecinfo.caixanocontrole\logs`

Não sincronize o banco aberto por serviços de nuvem e não o edite diretamente. Use o recurso de backup do aplicativo.
