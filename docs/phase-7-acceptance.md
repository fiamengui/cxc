# Aceite técnico — Fase 7

**Produto:** Caixa no Controle — Essencial 1.0  
**Data:** 05/08/2026  
**Resultado:** aprovado — Fase 7 concluída em 100%

## Escopo entregue

| Área | Evidência de conclusão |
| --- | --- |
| Catálogo | 17 relatórios organizados em Visão gerencial, Financeiro, Obrigações, Relacionamentos e Vendas |
| Consulta | Período, regime, contato, categoria, conta, forma, situação, ordenação e paginação |
| Visualização | Empresa, data/hora, regime, resumo dos filtros, tabela completa, totais, vazio, carregamento, sucesso e erro |
| Financeiro | Caixa por eventos de liquidação; competência por lançamentos; parciais e estornos reconciliados |
| PDF | A4 retrato até seis colunas e paisagem acima disso, logotipo opcional, cabeçalho, rodapé, páginas e totais |
| CSV | UTF-8 com BOM, separador `;`, metadados, totais e proteção de textos contra injeção de fórmula |
| Impressão | Prévia isolada do restante da interface e orientação A4 conforme a largura do relatório |
| Segurança | Consultas parametrizadas, ordenação por chaves permitidas, caminhos/extensões validados e limites de exportação |
| Auditoria | Cada PDF e CSV exportado gera evento local de auditoria |
| Persistência | Migração 0009 e índices para formas de pagamento, contato/competência e itens vendidos |

## Relatórios aceitos

1. Resumo financeiro mensal; 2. Entradas por período; 3. Despesas por período; 4. Despesas por categoria; 5. Entradas por categoria; 6. Movimentação por conta; 7. Movimentação por forma de pagamento; 8. Contas a receber; 9. Contas vencidas; 10. Contas a pagar; 11. Fluxo de caixa; 12. Resultado por período; 13. Histórico por cliente; 14. Histórico por fornecedor; 15. Vendas por período; 16. Produtos e serviços vendidos; 17. Comparativo mensal.

## Regras críticas comprovadas

- regime de caixa usa cada liquidação efetiva e não o valor integral de um lançamento parcialmente liquidado;
- regime de competência usa a data de competência e o efeito integral válido do lançamento;
- resultado e comparativo mensal respeitam o regime escolhido;
- obrigações exibem valor original e saldo restante sem duplicar a descrição do contato;
- estornos neutralizam o evento original sem apagar histórico;
- relatórios estritamente financeiros forçam e identificam o regime de caixa;
- nenhuma coluna é omitida do PDF; tabelas largas usam A4 paisagem e textos longos são sinalizados como truncados;
- PDF é limitado a 5 mil linhas e exportações gerais a 50 mil para preservar legibilidade e memória.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| ESLint | Aprovado, zero avisos |
| TypeScript estrito | Aprovado |
| Vitest | 20 testes aprovados; 2 específicos de formatação e nomes de relatórios |
| Playwright | 17 cenários aprovados; 2 específicos da central, filtros, totais, exportação e impressão |
| `cargo fmt --all -- --check` | Aprovado |
| `cargo clippy --all-targets --all-features -- -D warnings` | Aprovado |
| `cargo test --all-features` | 48 testes aprovados; 4 específicos da Fase 7 |
| Vite produção | Aprovado; módulo de relatórios carregado sob demanda |
| Auditoria npm | 0 vulnerabilidades conhecidas |
| PDF real | A4 paisagem, 1 página, todas as 9 colunas; renderização Poppler inspecionada visualmente |
| Tauri produção | Executável, MSI e NSIS x64 gerados |

## Artefatos Windows

| Artefato | Tamanho | SHA-256 |
| --- | ---: | --- |
| `caixa-no-controle.exe` | 17.108.480 bytes | `F9AF1C0B8612FE6B002940E00C7373D7097199D2C831664E67F80F700C85F7DE` |
| `Caixa no Controle_0.1.0_x64_en-US.msi` | 6.451.200 bytes | `7328C75ACE7D257071AEBA62340D6B796682FF0C103F0107186B5CFC82B0AC5A` |
| `Caixa no Controle_0.1.0_x64-setup.exe` | 4.607.054 bytes | `90764736733F942C957FD4B1210CF72643FD4084FBC7536648C9F49727B60AFA` |
| `Relatorio_Fase7_Aceite.pdf` | 4.021 bytes | `6966D730EB4590C7DC2BE5252910B0B67FC703E92BCDF3C6094AF2F836EC98AA` |

Os binários ficam em `%LOCALAPPDATA%\CaixaNoControle\cargo-target\release`. O PDF de aceite está em `output/pdf`.

## Fronteira da próxima fase

A Fase 8 permanece responsável pela continuidade completa: proteção opcional de backup, automação e retenção, diagnóstico, recuperação orientada e atualização. A criação/restauração manual e a licença offline já antecipadas serão evoluídas sem reimplementação.
