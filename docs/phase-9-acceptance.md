# Aceite da Fase 9 — Qualidade

Data do aceite: 06/08/2026

Status: **100% concluída**

## Matriz do escopo

| Área | Implementação e evidência | Situação |
|---|---|---|
| Testes | Domínio TypeScript, integração Rust/SQLite, 23 jornadas E2E e varredura Axe WCAG nos fluxos das Fases 2 a 9 | Concluída |
| Acessibilidade | Teclado, foco visível, link de salto, labels, alvos de 44 px, contraste, regiões roláveis, modais, mensagens vivas e movimento reduzido | Concluída |
| Desempenho | Migração 0011, paginação/lazy loading existentes e teste isolado com 50 mil movimentações, 10 mil contatos e 10 mil itens | Concluída |
| Revisão visual | Auditoria comparativa antes/depois, dashboard com dados realistas e breakpoints desktop e 720 px | Concluída |
| Revisão de cálculos | Invariantes de 1 a 120 parcelas e regressão de vendas, liquidações, ajustes, transferências, estornos, caixa, competência e metas | Concluída |
| Tratamento de falhas | Barreira global, mensagens seguras, recuperação, estados de erro, `busy_timeout` e ausência de detalhes técnicos na interface | Concluída |

## Desempenho de referência

O teste `database::tests::remains_responsive_at_the_reference_business_scale` cria um banco SQLite temporário, aplica todas as migrações e insere:

- 50.000 movimentações distribuídas por mais de cinco anos;
- 10.000 contatos;
- 10.000 produtos/serviços.

Na execução de aceite, a carga levou 2.417 ms e o conjunto de consultas paginadas/agregadas levou 8 ms. O teste exige plano usando os índices da Fase 9 e falha se as consultas críticas ultrapassarem cinco segundos. Nenhum teste usa o banco real do cliente.

## Revisão financeira independente

Os testes validam a soma exata e o resto na última parcela para todas as quantidades de 1 a 120, rejeitam parcelas inferiores a um centavo e preservam inteiros seguros. A regressão cobre valor bruto e líquido, descontos, taxas, juros, multas, baixas parciais, venda parcelada/mista, neutralidade de transferências, restauração por estorno, saldo e resultados por caixa e competência.

## Evidências visuais

- `phase-9-audit/01-estado-inicial.png`: falha técnica e composição antes da correção;
- `phase-9-audit/04-dashboard-compacto-720.png`: gaveta compacta, conteúdo responsivo e ausência de overflow no DOM;
- `phase-9-audit/06-dashboard-final-completo.png`: visão final com dados realistas, filtros, indicadores e gráficos.

O relatório comparativo está em [phase-9-audit/report.md](phase-9-audit/report.md).

## Comandos de aceite

```powershell
npm run lint
npm run typecheck
npm run test:run
npm run test:e2e
npm run test:a11y
npm run test:performance
npm audit --audit-level=high
Set-Location src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
Set-Location ..
npm run tauri:build
```

## Fronteira preservada

A Fase 10 permanece responsável por manual final, dados demonstrativos de distribuição, release, instalador final assinado quando houver certificado e checklist de entrega em máquina limpa.
