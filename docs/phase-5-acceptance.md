# Aceite técnico — Fase 5

**Produto:** CaixaSimples - Bratec — Essencial 1.0
**Data:** 05/08/2026  
**Resultado:** aprovado — Fase 5 concluída em 100%

## Escopo entregue

| Área | Evidência de conclusão |
| --- | --- |
| Vendas | Listagem persistente, pesquisa, filtros, período, cliente, paginação, rascunho, confirmação, detalhe, edição de rascunho, duplicação e cancelamento |
| Itens | Catálogo opcional ou item avulso, quantidade com três casas decimais, unidade, preço editável, desconto e snapshot histórico completo |
| Cálculos | Total bruto, desconto por item, desconto adicional, taxa e total líquido calculados em centavos e revalidados no backend |
| Recebimentos | Imediato, futuro, parcelado e misto; até 120 contas, vencimentos mensais, soma exata e diferença de centavos na última |
| Integração financeira | Grupo único por venda, origem rastreável, contas a receber reais, liquidação total/parcial, estorno e situação comercial sincronizada |
| Idempotência | Repetir a confirmação devolve os vínculos existentes e não cria outra venda, grupo ou parcela |
| Atomicidade | Falha de referência, validação ou limite do trial desfaz venda, itens, grupo, parcelas, auditoria e consumo do limite |
| Cancelamento | Pendências são canceladas com motivo; recebimentos ativos exigem estorno anterior; nenhum histórico financeiro é apagado |
| Comprovante | Marca/logotipo, empresa, cliente, número, data, itens, valores, pagamento, observações e “Documento sem valor fiscal” |
| Saída | Visualização própria, impressão A4 e arquivo PDF real gerado localmente e sem dependência de internet |
| Integrações | Vendas reais no detalhe de contatos; acesso a partir de contas a receber; cadastros referenciados protegidos |

## Regras críticas comprovadas

- itens avulsos não exigem cadastro e itens de catálogo não mudam quando nome/preço atuais forem alterados;
- dinheiro nunca usa ponto flutuante persistido; valores são `INTEGER` em centavos e quantidades usam milésimos inteiros;
- a soma das parcelas sempre coincide com o total pendente, inclusive quando houver resto de arredondamento;
- a confirmação ocorre em uma transação única e consome o trial pelo número real de lançamentos gerados;
- uma repetição segura da confirmação funciona mesmo que o catálogo seja desativado após a primeira gravação;
- recebimento imediato gera liquidação real; venda mista inicia parcialmente recebida; as demais iniciam confirmadas;
- liquidações e estornos atualizam `CONFIRMED`, `PARTIALLY_RECEIVED` ou `RECEIVED` sem recriar registros;
- movimentações com origem de venda não são alteradas, duplicadas nem canceladas fora do fluxo comercial;
- o comprovante é explicitamente não fiscal; a versão 1.0 não introduz PDV fiscal nem controle de estoque.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| ESLint | Aprovado, zero avisos |
| TypeScript estrito | Aprovado |
| Vitest | 14 testes aprovados |
| Playwright | 13 cenários aprovados; 2 específicos da Fase 5 |
| `cargo fmt --all -- --check` | Aprovado |
| `cargo clippy --all-targets -- -D warnings` | Aprovado |
| `cargo test --all-targets` | 41 testes aprovados; 6 específicos de vendas |
| Vite produção | Aprovado |
| Auditoria npm | 0 vulnerabilidades conhecidas |
| Tauri produção | Executável, MSI e NSIS x64 gerados |
| Inicialização real | Executável permaneceu ativo e inicializou a aplicação |
| SQLite real | Migração 6→7 aplicada; versões 1–7 presentes; `quick_check=ok`; zero violações de chave estrangeira |

## Artefatos Windows

| Artefato | Tamanho | SHA-256 |
| --- | ---: | --- |
| `CaixaSimples - Bratec_0.1.0_x64_en-US.msi` | 5.955.584 bytes | `03447EFAE5C7A972D569368286C17F2B6F195E1B4DA6C94EBA4E92AAD90FF42F` |
| `CaixaSimples - Bratec_0.1.0_x64-setup.exe` | 4.235.188 bytes | `83D2715ADB2C74448A17196ED87C1EB81887E9AD82F78830CEA476F0B175DDD7` |

Diretório: `%LOCALAPPDATA%\CaixaNoControle\cargo-target\release\bundle`.

## Fronteira da próxima fase

A Fase 6 permanece responsável pelo dashboard, metas e conclusão da experiência de gestão. Contas a receber, contas a pagar e fluxo de caixa já existem e estão reconciliados porque foram necessários às Fases 4 e 5; a próxima fase deve evoluí-los sem duplicar o domínio financeiro nem alterar os snapshots das vendas.
