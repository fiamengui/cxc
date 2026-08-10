# Aceite da Fase 2 — Primeiro acesso

Status: **100% concluída em 03/08/2026**.

| Item do escopo | Evidência implementada |
| --- | --- |
| Boas-vindas | Produto, marca BratecInfo, texto, versão, configurar, restaurar e ativar |
| Ativação | Importação `.cnclic`, assinatura Ed25519, versão principal, edição, cliente e vínculo opcional à instalação |
| Demonstração | Trial de 7 dias ou 50 movimentações, aviso e preservação dos dados após ativação |
| Onboarding | 9 etapas, progresso visível, retorno sem perda do formulário e validação frontend/backend |
| Empresa e preferências | Empresa, conta, saldo, padrões, categorias, pagamentos e meta persistidos transacionalmente |
| Usuário | Administrador local com senha Argon2id; senha nunca entra na auditoria |
| Dados de exemplo | Escolha independente do trial, `is_demo` e remoção em um comando |
| Continuidade necessária | Backup/restore manual real, integridade, prevenção, migrações, auditoria e relançamento |

## Validação executada

- ESLint, TypeScript e build Vite aprovados;
- 3 testes Vitest aprovados;
- 2 cenários Playwright aprovados;
- `cargo fmt` e Clippy com `-D warnings` aprovados;
- 12 testes Rust aprovados;
- assinatura gerada com chave privada externa validada contra a chave pública incorporada;
- `npm audit`: zero vulnerabilidades conhecidas;
- MSI e NSIS x64 gerados pelo build Tauri de produção;
- executável iniciou e confirmou a migração 0004 com todas as tabelas obrigatórias.

## Limite deliberado

A Fase 2 contém o estado e a avaliação do limite de 50 movimentações. O incremento deve ocorrer na mesma transação que criará uma movimentação na Fase 4, pois esse agregado ainda não existe. Backup automático e proteção opcional por senha permanecem no escopo integral da Fase 8; somente a continuidade necessária ao primeiro acesso foi antecipada.
