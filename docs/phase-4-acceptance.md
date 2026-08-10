# Aceite técnico — Fase 4

**Produto:** CaixaSimples - Bratec — Essencial 1.0
**Data:** 04/08/2026  
**Resultado:** aprovado — Fase 4 concluída em 100%

## Escopo entregue

| Área | Evidência de conclusão |
| --- | --- |
| Movimentações | Receitas, despesas, aportes, retiradas e ajustes; listagem paginada, abas, filtros, detalhe e histórico |
| Situações | Rascunho, pendente, liquidado e cancelado persistidos; parcial, atrasado e estornado calculados sem corromper o histórico |
| Liquidação | Baixa total/parcial com data, conta, forma, desconto, taxa, juros, multa, valor efetivo e observação |
| Parcelas | Grupo próprio, até 120 parcelas, numeração, vencimentos editáveis, soma exata e resto na última |
| Recorrências | Semanal, mensal, bimestral, trimestral, semestral e anual; intervalo, início, término, limite, pausa e geração sob demanda |
| Transferências | Duas movimentações liquidadas no mesmo grupo; saldos opostos e resultado zero |
| Cancelamentos | Permitidos apenas para rascunhos/pendências sem liquidação, sempre com motivo e auditoria |
| Estornos | Movimento inverso, motivo, data, recomposição do saldo, auditoria e retenção do original; transferências desfazem as duas pontas |
| Regimes | Caixa por data/valor efetivo da liquidação; competência por data de competência; aportes, retiradas e transferências fora do resultado |
| Interface | Cadastro adaptativo, estados vazio/carregando/erro/sucesso, ações contextuais, impressão e visualização de liquidações/histórico |

## Regras críticas comprovadas

- dinheiro é `INTEGER` em centavos em todas as tabelas e contratos;
- saldo atual considera saldo inicial vencido e somente eventos liquidados até a data corrente;
- pendências não alteram saldo disponível;
- baixa parcial mantém o valor bruto original e reduz apenas o saldo pendente;
- desconto, taxa, juros e multa são reconciliados entre principal e valor efetivamente movimentado;
- atraso não é persistido: deriva de pendência mais vencimento anterior ao dia local;
- recorrências mantêm a data-base ao atravessar meses curtos e pausam modelos que perderam referências válidas;
- operações agrupadas e o consumo do trial são transacionais;
- cadastros usados pelo financeiro não podem ser excluídos de forma inconsistente.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| ESLint | Aprovado, zero avisos |
| TypeScript | Aprovado em modo estrito |
| Vitest | 10 testes aprovados |
| Playwright | 11 cenários aprovados |
| `cargo fmt --check` | Aprovado |
| `cargo clippy --all-targets -- -D warnings` | Aprovado |
| `cargo test --all-targets` | 35 testes aprovados |
| Vite produção | Aprovado |
| Tauri produção | Executável, MSI e NSIS x64 gerados |
| SQLite real | Migração máxima 6, quatro tabelas financeiras, 13 índices e `PRAGMA quick_check = ok` |

## Artefatos Windows

- executável: `%LOCALAPPDATA%\\CaixaNoControle\\cargo-target\\release\\caixasimples-bratec.exe`;
- MSI: `%LOCALAPPDATA%\\CaixaNoControle\\cargo-target\\release\\bundle\\msi\\CaixaSimples - Bratec_0.1.0_x64_en-US.msi`;
- NSIS: `%LOCALAPPDATA%\\CaixaNoControle\\cargo-target\\release\\bundle\\nsis\\CaixaSimples - Bratec_0.1.0_x64-setup.exe`.

## Fronteira da próxima fase

A Fase 5 permanece responsável por vendas, itens da venda, geração idempotente de recebíveis e comprovante não fiscal. A Fase 4 oferece os vínculos `origin_type`/`origin_id` e grupos necessários, mas não criou vendas fictícias nem duplicou esse escopo. Contas a receber, contas a pagar e fluxo de caixa foram antecipados apenas para reconciliar o núcleo; dashboard e metas continuam na Fase 6.
