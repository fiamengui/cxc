# Aceite técnico — Fase 6

**Produto:** Caixa no Controle — Essencial 1.0  
**Data:** 05/08/2026  
**Resultado:** aprovado — Fase 6 concluída em 100%

## Escopo entregue

| Área | Evidência de conclusão |
| --- | --- |
| Dashboard | Saudação, empresa, período, agrupamento e atalhos; oito indicadores com explicação, comparação, carregamento e ausência de dados |
| Gráficos | Entradas/saídas em barras diárias ou mensais, saldo acumulado em linha e despesas por categoria com posição, valor e percentual |
| Meta no dashboard | Faturamento realizado, restante, percentual e média necessária por dia útil, com acesso direto ao mês correspondente |
| Listas rápidas | Próximos pagamentos, próximos recebimentos, atrasos, maiores despesas e últimas movimentações, limitadas e navegáveis até o detalhe exato |
| Contas a receber | Cinco indicadores, pesquisa, situação, período, paginação, valores original/restante, atraso e ações completas de recebimento e contexto |
| Cobrança | Texto gerado localmente, editável e copiável; nenhuma mensagem é enviada automaticamente |
| Contas a pagar | Cinco indicadores, filtros e ações de pagamento integral/parcial, edição, reagendamento, duplicação, cancelamento, fornecedor e recorrência destacada |
| Fluxo de caixa | Seis cartões, tabela diária completa, filtros por conta/período/categoria/regime/situação e projeção de pendências até uma data |
| Metas | Faturamento, limite de despesas, resultado, vendas e novos clientes, persistidos por mês com realizado, percentual, diferença, comparação e ritmo |
| Persistência | Migração 0008, autoria de metas, referência mensal normalizada, auditoria e consultas parametrizadas com dinheiro em centavos |
| Desempenho | Índices de liquidação/data, cliente/data e meta/referência; paginação; agregações SQL; carregamento sob demanda dos módulos |

## Regras críticas comprovadas

- saldo e gráficos de caixa utilizam apenas liquidações e carregam o saldo acumulado a partir das contas e eventos anteriores;
- aportes e transferências movimentam saldo, mas permanecem fora do resultado gerencial;
- contas parcialmente liquidadas preservam valor original e mostram somente o saldo restante;
- atraso é calculado pela data atual e não persistido como situação definitiva;
- projeção é exibida como previsão e não substitui nem se confunde com o saldo final realizado;
- faturamento, despesas e resultado das metas usam competência; quantidade de vendas ignora rascunhos/cancelamentos;
- despesas são tratadas como limite: abaixo do teto é favorável e acima do teto é crítico;
- a média diária considera somente o que falta; após atingir a meta, o necessário é zero;
- uma única meta mensal é atualizada por `upsert`, com autoria e auditoria, sem criar duplicidade;
- períodos, agrupamentos, situações, projeções e valores são validados novamente no backend.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| ESLint | Aprovado, zero avisos |
| TypeScript estrito | Aprovado |
| Vitest | 18 testes aprovados; 4 específicos das regras visuais/percentuais de gestão |
| Playwright | 15 cenários aprovados; 2 específicos de dashboard e metas |
| `cargo fmt --all -- --check` | Aprovado |
| `cargo clippy --all-targets --all-features -- -D warnings` | Aprovado |
| `cargo test --all-features` | 44 testes aprovados; 3 específicos de gestão e cobertura financeira compartilhada |
| Vite produção | Aprovado; pacote inicial de 346,84 kB, sem aviso de chunk grande |
| Planos SQLite | `EXPLAIN QUERY PLAN` confirmou índices nas metas, vendas, novos clientes, liquidações e obrigações |
| Auditoria npm | 0 vulnerabilidades conhecidas |
| Tauri produção | Executável, MSI e NSIS x64 gerados |
| Inicialização real | Executável final permaneceu ativo no teste de abertura |
| SQLite real | Cópia preventiva criada; migração 7→8 aplicada; `quick_check=ok`; zero violações de chave estrangeira |

## Artefatos Windows

| Artefato | Tamanho | SHA-256 |
| --- | ---: | --- |
| `caixa-no-controle.exe` | 15.948.288 bytes | `8FA89BBD8C67626B5DF57ED11AD978E3F36FDC3AB526FD5100FBE88D34D4135F` |
| `Caixa no Controle_0.1.0_x64_en-US.msi` | 6.008.832 bytes | `9EB51C7AAC9AD0ACDB3896838BB4B5A08225967B9461C2A3A7DD67BC5F183C75` |
| `Caixa no Controle_0.1.0_x64-setup.exe` | 4.282.812 bytes | `0A5CF3723B46A039906996FA9FAF6382EAFDF95B9BAB0D8D42B65B42172F141D` |

Diretório: `%LOCALAPPDATA%\CaixaNoControle\cargo-target\release`.

A cópia preventiva do banco anterior à migração foi preservada em `%APPDATA%\br.com.bratecinfo.caixanocontrole\caixa-no-controle.pre-phase6-20260805-1604.db`.

## Fronteira da próxima fase

A Fase 7 permanece responsável pela central de relatórios, filtros, pré-visualização, impressão e exportações PDF/CSV. Ela deve reutilizar as mesmas regras financeiras reconciliadas nesta fase e identificar explicitamente o regime utilizado, sem introduzir cálculos paralelos.
