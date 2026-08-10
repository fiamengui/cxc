# Plano de Implementação — CaixaSimples - Bratec

## Checkpoint BETA_PRODUCTION_READINESS — 10/08/2026

- Estado de partida preservado no Git antes da preparação da beta.
- Versão de entrada: `1.1.0`; primeira beta segura: `1.2.0-beta.1` para evitar downgrade.
- Arquitetura mantida: React → serviço de aplicação → comando Tauri → serviço/repositório Rust → SQLite; backend comercial Fastify → PostgreSQL.
- Compatibilidade obrigatória: o identificador Tauri `br.com.bratecinfo.caixanocontrole`, o `upgradeCode` do MSI, códigos `CNC-*`, código de produto de licenças, nomes de banco e diretórios persistidos permanecem internos para preservar upgrades, licenças e dados existentes.
- Ambientes encontrados: desktop local; Neon/Render/Mercado Pago em sandbox; produção externa ainda depende de banco separado e troca segura de secrets.
- Meta autorizada: beta gratuita controlada de até cinco clientes convidados, canal `beta`, sem bypass universal e sem cobrança dos convidados ativos.

### Progresso da preparação da beta

- [x] Fase 1 — auditoria, checkpoint, rename compatível e testes de regressão.
- [~] Fase 2 — código, migrations e health prontos; criação/troca segura do Neon e Render externos pendente.
- [x] Fase 3 — resiliência e experiência de cold start do Render.
- [x] Fase 4 — convites, limite, administração mínima e entitlement beta.
- [~] Fase 5 — isolamento, preços, checkout e webhook testados; login/configuração real do Mercado Pago pendente.
- [~] Fase 6 — pipeline e build local validados; recompilação final aguarda URL Render de produção.
- [~] Fase 7 — geração de hashes, manifesto, aviso e notas pronta; artefatos finais aguardam o build de produção.
- [ ] Fase 8 — smoke test em Windows limpo.
- [~] Fase 9 — pipeline MSIX, assets e checklist prontos; identidade do Partner Center e pacote definitivo pendentes.

Na Fase 1, a identidade visual foi alterada para `CaixaSimples - Bratec`. Permanecem deliberadamente antigos apenas identificadores internos persistidos e a migration histórica `0001_commercial.sql`, cuja alteração quebraria compatibilidade e verificação de checksum.

**Produto:** CaixaSimples - Bratec — Essencial 1.0
**Responsável:** BratecInfo  
**Atualizado em:** 10/08/2026
**Situação:** Sistema funcional anterior preservado; preparação da beta em execução, com Fase 1 concluída.

## 1. Diagnóstico técnico

O repositório foi criado, mas não contém código, configuração, dependências nem histórico de commits de produto. Há somente os metadados do Git. Portanto, a aplicação será inicializada do zero, sem compatibilidade retroativa a preservar.

Ambiente detectado:

| Item | Situação |
| --- | --- |
| Windows | Ambiente-alvo e ambiente atual |
| Node.js | Disponível (`v24.15.0`) |
| npm | Disponível (`11.12.1`) |
| Rust (`rustc` e `cargo`) | Disponível (`1.97.1`, MSVC) |
| Tauri CLI | Será instalado como dependência local da Fase 1 |

O Rust é requisito obrigatório do Tauri 2 e foi instalado como toolchain estável MSVC. Não será criado um substituto web que viole a arquitetura requerida.

## 2. Decisões arquiteturais

1. **Desktop local:** Tauri 2 com React, Vite e TypeScript estrito. Não haverá dependência de CDN, servidor ou `localStorage` como persistência principal.
2. **Camadas:** UI React → serviços de aplicação TypeScript → comandos Tauri tipados → serviços/repositórios Rust → SQLite. Componentes não executam SQL.
3. **Banco:** SQLite local com WAL, integridade referencial habilitada, migrações SQL versionadas e consultas parametrizadas. Valores monetários são `INTEGER` em centavos; datas de negócio são texto ISO `YYYY-MM-DD`; auditoria em UTC.
4. **Domínio financeiro:** cálculos puros e testáveis. Aportes, retiradas e transferências ficam fora de faturamento/resultado. Status de atraso é calculado na consulta, nunca gravado.
5. **Identificadores e exclusões:** UUIDs; exclusão lógica para entidades de negócio; registros financeiros liquidados são estornados, nunca apagados pela interface.
6. **Segurança:** senha com Argon2id; nenhuma chave privada distribuída; licença verificada por assinatura assimétrica com chave pública incorporada; capabilities Tauri mínimas; caminhos e arquivos externos validados.
7. **Qualidade:** Rust (`cargo test`, `clippy`, `fmt`) e frontend (ESLint, `tsc --noEmit`, Vitest, Playwright). Cada fase só avança após os comandos aplicáveis passarem.

## 3. Estrutura proposta

```text
/
├── src/
│   ├── app/                 # bootstrap, rotas e providers
│   ├── components/          # UI reutilizável acessível
│   ├── features/            # módulos verticais da interface
│   ├── application/         # serviços/contratos de casos de uso
│   ├── domain/              # regras financeiras puras e tipos
│   ├── infrastructure/      # adaptador seguro dos comandos Tauri
│   ├── schemas/             # validações Zod
│   ├── hooks/, types/, utils/, styles/
│   └── test/
├── src-tauri/
│   ├── src/commands/        # fronteira de comandos Tauri
│   ├── src/database/        # conexão, migração e repositórios
│   ├── src/{backup,licensing,reports,security,logging}/
│   ├── migrations/          # SQL versionado
│   └── capabilities/
├── scripts/license-generator/ # ferramenta interna; nunca empacotada
├── tests/{integration,e2e}/
├── docs/
├── README.md
├── AGENTS.md
├── CHANGELOG.md
└── IMPLEMENTATION_PLAN.md
```

## 4. Modelo inicial do banco

### Migração 0001 — fundação

`business_profile`, `app_preferences`, `local_users`, `categories`, `financial_accounts`, `payment_methods`, `audit_logs` e `app_migrations`.

Regras-chave: uma única empresa na edição Essencial; saldo inicial em centavos e data explícita; `categories.parent_id` auto-referenciado; índices por tipo, situação, datas e chaves estrangeiras.

### Migração 0002 — primeiro acesso

Estado de licença, trial, período e limite de movimentações.

### Migração 0003 — cadastros iniciais

`contacts` e `catalog_items`, ambos com exclusão lógica e índices de busca por nome, documento e código.

### Migração 0004 — conclusão da Fase 2

Identificação dos dados demonstrativos, contador de uso do trial, unicidade da licença, identificador da instalação e `goals` para a meta mensal opcional.

### Migração 0005 — conclusão da Fase 3

Índices para telefone, WhatsApp, papéis e situação dos contatos, tipo/situação do catálogo, hierarquia de categorias e contas ativas. Os cinco cadastros recebem autoria de criação e última atualização. As formas Prazo e Outro completam as opções iniciais.

### Migração 0006 — conclusão da Fase 4

`entry_groups`, `recurrences`, `financial_entries` e `entry_settlements`, com valores em centavos, autoria, auditoria e índices por data, tipo/situação, contato, categoria, conta, origem, grupo e recorrência. Liquidações parciais são eventos independentes; transferências e estornos mantêm as duas pontas e os vínculos históricos.

### Migração 0007 — conclusão da Fase 5

`sales` e `sale_items`, com número anual sequencial, cliente, categoria, valores em centavos, condição de recebimento, grupo financeiro, situações comerciais, autoria e cancelamento auditável. Os itens preservam descrição, quantidade de três casas, unidade, preço e desconto praticados; índices cobrem data/situação, cliente, número e vínculos com venda/catálogo.

### Migração 0008 — conclusão da Fase 6

Metas mensais recebem autoria de criação/alteração e referência normalizada em `YYYY-MM`. Índices adicionais cobrem liquidações por data, novos clientes por data e metas por referência, sustentando as agregações do dashboard e dos indicadores sem duplicar o domínio financeiro.

## 5. Dependências previstas

| Área | Dependências |
| --- | --- |
| Aplicação | `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-opener` e `@tauri-apps/plugin-process` |
| Interface | React, Tailwind CSS, Lucide React, React Hook Form, Zod e `@hookform/resolvers` |
| Gráficos e documentos | Recharts; geração local de PDF e CSV compatível com licença comercial |
| Rust | `tauri`, `rusqlite` (SQLite incorporado), `serde`, `uuid`, `chrono`, `argon2`, `ed25519-dalek`, `zip`, `sha2`, `tracing` |
| Testes | Vitest, Testing Library, Playwright; testes Rust com banco temporário |

Versões exatas serão fixadas no `package-lock.json` e `Cargo.lock` após a instalação, usando versões estáveis compatíveis no momento da fundação.

## 6. Riscos e tratamentos

| Risco | Impacto | Tratamento |
| --- | --- | --- |
| Rust ausente | Bloqueia Tauri, testes Rust e instalador | Instalar Rust estável/MSVC e reiniciar o terminal antes da Fase 1 |
| Regras financeiras ambíguas em liquidação parcial | Saldo e relatórios incorretos | Modelar cada baixa parcial como evento auditável e testar cenários de desconto, juros e multa |
| Licença/chave privada | Risco de exposição | Gerador separado, variável/arquivo externo local; somente chave pública no app |
| Backup interrompido/restauração inválida | Perda de dados | Arquivo temporário, checksum, validação completa e backup preventivo |
| Limite de desempenho | Interface lenta em bases grandes | Índices, paginação no banco, agregações SQL e medições com massa de dados |
| Assinatura do instalador | Alertas do Windows | Processo documentado; certificado e identidade da editora dependem da BratecInfo |
| Controle de Aplicativo do Windows | Pode impedir ferramentas e binários temporários de desenvolvimento | Manter a política suplementar de desenvolvimento limitada ao ambiente aprovado |

## 7. Fases e critérios de saída

| Fase | Entrega | Critério de saída |
| --- | --- | --- |
| 0. Análise | Este plano e decisões | Repositório e ambiente inspecionados |
| 1. Fundação | Tauri/React, layout, rotas, design system, SQLite, migrações, erros e logs | App abre, persiste uma migração, lint/tipos/testes/build passam |
| 2. Primeiro acesso | Boas-vindas, demo, ativação e onboarding | Empresa, preferências e usuário persistem com validação |
| 3. Cadastros | Contatos, categorias, contas, pagamentos e catálogo | CRUD real, busca, inativação e auditoria quando aplicável |
| 4. Financeiro | Lançamentos, parcelas, recorrências, transferências, baixas e estornos | Regras e testes de cálculo passam; saldo consistente |
| 5. Vendas | Venda, itens, recebíveis e comprovante | Venda confirma sem duplicação e gera parcelas corretas |
| 6. Gestão | Dashboard, fluxo, pagar/receber e metas | Indicadores coerentes nos dois regimes |
| 7. Relatórios | Filtros, CSV, PDF e impressão | Relatórios legíveis e valores reconciliados |
| 8. Continuidade | Backup, restauração, licença, diagnóstico e atualização | Integridade comprovada em testes de restauração/licença |
| 9. Qualidade | Cobertura, acessibilidade, desempenho e revisão | Fluxos E2E críticos aprovados |
| 10. Distribuição | Instalador, manual e release | Concluída: Windows offline instalável, manual, demo removível, release e checklist automatizado |

## 8. Validação por fase

Após cada fase executaremos, conforme aplicável:

```powershell
npm run lint
npm run typecheck
npm test -- --run
npm run build
cargo fmt --check
cargo clippy -- -D warnings
cargo test
npm run test:e2e
```

Além disso, todo fluxo com dinheiro terá testes de centavos, arredondamento, idempotência, caixa/competência, transferência, liquidação parcial e estorno. Nenhum teste apontará para a base real do usuário.

## 9. Pendências externas não bloqueantes no início

- Logotipo, ícones finais e identidade visual oficial da BratecInfo;
- chave pública de produção e processo seguro para guardar a chave privada;
- certificado de assinatura de código Windows;
- texto jurídico final da licença/EULA e canal de suporte;
- política comercial final para suporte e expiração do modo de demonstração.

## 10. Próxima ação necessária

Iniciar a Fase 9 — Qualidade — somente após autorização do cliente. Executar a rodada transversal de acessibilidade, desempenho com massa, revisão visual, cálculos e tratamento de falhas.

## 11. Registro de validação — Fases 1 a 3

| Verificação | Resultado |
| --- | --- |
| `npm run lint` | Aprovado |
| `npm run typecheck` | Aprovado |
| `npm run test:run` | Aprovado: 6 testes |
| `npm run build` | Aprovado: build Vite de produção |
| `cargo fmt --all -- --check` | Aprovado após formatação |
| `npm run test:e2e` | Aprovado: 6 cenários, incluindo onboarding, CRUD da Fase 3, busca, inativação, auditoria visual e importação CSV |
| `cargo clippy --all-targets -- -D warnings` | Aprovado |
| `cargo test --all-targets` | Aprovado: 20 testes Rust |
| `npm run tauri:build` | Aprovado: MSI e instalador NSIS x64 gerados |
| Inicialização do executável de produção | Aprovada: processo iniciou e aplicou a migração 0005 em perfil de desenvolvimento vazio; `quick_check` retornou `ok` |
| Logs rotativos | Aprovado: arquivo diário criado no diretório local de logs da aplicação |
| Onboarding | Aprovado: 9 etapas, persistência transacional e preservação de licença ativa |
| Licença | Aprovado: Ed25519, adulteração recusada, versão principal e vínculo opcional à instalação |
| Backup/restore antecipado | Aprovado: manifesto, checksums, SQLite `quick_check`, substituição com rollback e reinício |
| Auditoria npm | Aprovada: 0 vulnerabilidades conhecidas |
| Build Fase 3 | Aprovado: MSI e NSIS x64 atualizados |

## 12. Registro de entrega — Fase 2

- tela de boas-vindas com marca, versão, começo da configuração, restauração e ativação;
- assistente com as 9 etapas do escopo, progresso, retorno e preservação do preenchimento;
- criação transacional da empresa, conta inicial, saldo, preferências, categorias, formas de pagamento e meta mensal opcional;
- usuário administrador local com senha protegida por Argon2id e auditoria da configuração;
- trial de sete dias ou 50 movimentações, aviso não invasivo e dados preservados após ativação;
- carga demonstrativa independente do trial, registros identificados e remoção em um comando;
- ativação offline real por licença Ed25519, identificador da instalação, ferramenta interna separada e chave privada fora do repositório;
- criação e restauração manual de backup antecipadas da Fase 8 para fechar o primeiro acesso sem operações fictícias; proteção opcional por senha e backup automático continuam pertencendo à Fase 8.

## 13. Progresso — Fase 3

Status: **100% concluída em 04/08/2026**.

- contatos com CRUD, papéis, busca, filtros, paginação, etiquetas, possíveis duplicidades, detalhes em sete abas, inativação e auditoria;
- importação CSV com modelo, seleção, prévia, mapeamento, validação, relatório de erros, confirmação de duplicidades e transação atômica; exportação filtrada e segura;
- categorias hierárquicas com natureza, cor, ícone, proteção de ciclos, dependências e duplicidades;
- contas financeiras com tipo, instituição, saldo/data inicial, cor e garantia de conta padrão;
- formas de pagamento com tipo, taxa, prazo, registros do sistema e opções Prazo/Outro;
- catálogo pesquisável e paginado de produtos/serviços, sem estoque, com código, categoria, venda, custo opcional e unidade;
- UUIDs, valores em centavos, consultas parametrizadas, exclusão lógica e autoria `created_by`/`updated_by`;
- estados vazio, carregamento, sucesso e erro nas interfaces;
- 20 testes Rust, 6 testes Vitest, 6 cenários Playwright, lint, tipos, Clippy, build Vite e build Tauri aprovados;
- executável e instaladores Windows validados com a migração 0005 e integridade SQLite.

## 14. Progresso — Fase 4

Status: **100% concluída em 04/08/2026**.

- receitas, despesas, aportes, retiradas e ajustes com rascunho, pendência, liquidação e atraso calculado;
- liquidações totais e parciais com conta, forma, desconto, taxa, juros, multa, valor efetivo, observação e preservação do valor original;
- parcelamento em até 120 vezes, vencimentos editáveis, soma exata e diferença de arredondamento na última parcela;
- recorrências semanais, mensais, bimestrais, trimestrais, semestrais e anuais, com intervalo, início, término, limite, pausa e geração ancorada;
- transferências com saída e entrada no mesmo grupo e resultado neutro;
- cancelamento restrito a registros sem baixa e estorno inverso de registros liquidados, inclusive das duas pontas de transferências;
- saldo por conta, resultado por caixa e competência, projeção identificada, contas a receber/pagar e integração com contatos;
- interface paginada com todas as abas, filtros, colunas, cadastro adaptativo, detalhe, histórico e feedbacks previstos;
- 35 testes Rust, 10 testes Vitest e 11 cenários Playwright, incluindo centavos, ajustes, parcelas, recorrências, trial, liquidações, transferências, estornos, caixa/competência e projeções;
- lint, tipos, Vite, `cargo fmt`, Clippy e build Tauri aprovados;
- executável, MSI e NSIS x64 gerados; binário de produção iniciou, aplicou a migração 0006 e retornou `quick_check=ok` em perfil local vazio.

O aceite detalhado e a fronteira preservada para a Fase 5 estão em [docs/phase-4-acceptance.md](docs/phase-4-acceptance.md).

## 15. Progresso — Fase 5

Status: **100% concluída em 05/08/2026**.

- vendas com rascunho, confirmação, pesquisa, filtros, paginação, detalhe, duplicação, cancelamento e histórico;
- itens de catálogo ou avulsos, quantidade fracionada, preço editável e snapshot histórico independente de alterações futuras no cadastro;
- totais bruto/líquido, descontos por item/adicional e taxa calculados em centavos no domínio e validados novamente no backend;
- recebimento imediato, futuro, em até 120 parcelas ou parte imediata/parte pendente;
- confirmação transacional e idempotente: venda, itens, consumo do trial, grupo e recebíveis são gravados uma única vez ou integralmente desfeitos;
- situação comercial sincronizada com liquidações e estornos; cancelamento exige estorno prévio de recebimentos e preserva pendências canceladas no histórico;
- comprovante não fiscal com marca, empresa, cliente, venda, itens, valores, pagamento e observações, para impressão e PDF local;
- integração no detalhe do contato, contas a receber e bloqueios de alteração indevida nos lançamentos originados pela venda;
- 41 testes Rust, 14 testes Vitest e 13 cenários Playwright, além de lint, tipos, Vite, `cargo fmt`, Clippy, auditoria npm e build Tauri aprovados;
- executável, MSI e NSIS x64 gerados; binário de produção iniciou, migrou uma base real da versão 6 para 7 e retornou `quick_check=ok` e zero violações de chave estrangeira.

O aceite detalhado e a fronteira preservada para a Fase 6 estão em [docs/phase-5-acceptance.md](docs/phase-5-acceptance.md).

## 16. Progresso — Fase 6

Status: **100% concluída em 05/08/2026**.

- dashboard com saudação, empresa, período configurável, ações rápidas, oito indicadores explicados e comparação histórica quando calculável;
- barras de entradas/saídas com agrupamento diário ou mensal, evolução acumulada do saldo, despesas por categoria com valor/percentual e progresso mensal com média útil necessária;
- listas rápidas de próximos pagamentos/recebimentos, atrasos, maiores despesas e últimas movimentações, todas abrindo o detalhe financeiro exato;
- contas a receber/pagar com cinco indicadores, filtros, paginação, totalização, baixa integral/parcial e todas as ações contextuais previstas, incluindo cobrança local editável;
- fluxo diário com saldo inicial/final, entradas, saídas, resultado por caixa ou competência e projeção de pendências claramente separada do saldo real;
- cinco metas mensais persistentes: faturamento, limite de despesas, resultado, vendas e novos clientes, com realizado, percentual, diferença, mês anterior e ritmo útil/corrido;
- migração 0008 com autoria de metas, normalização da referência e índices para agregações; consultas parametrizadas e valores em centavos;
- carregamento sob demanda por módulo, reduzindo o pacote inicial de 500,62 kB para 346,84 kB e eliminando o aviso de tamanho do build;
- 44 testes Rust, 18 testes Vitest e 15 cenários Playwright aprovados, incluindo 2 cenários E2E específicos da gestão;
- executável, MSI e NSIS x64 gerados; executável final iniciou, migrou a base real de 7 para 8 e preservou `quick_check=ok` e zero violações de chave estrangeira.

O aceite detalhado e a fronteira preservada para a Fase 7 estão em [docs/phase-6-acceptance.md](docs/phase-6-acceptance.md).

## 17. Progresso — Fase 7

Status: **100% concluída em 05/08/2026**.

- central pesquisável e organizada em cinco grupos, com os 17 relatórios obrigatórios do escopo;
- filtros por período, regime, contato, categoria, conta, forma de pagamento e situação, adaptados ao relatório;
- pré-visualização paginada, ordenação por qualquer coluna, totais, metadados de empresa, geração, filtros e regime;
- cálculos reconciliados em caixa e competência, inclusive liquidações parciais, estornos e saldos pendentes;
- exportação CSV UTF-8 com BOM, delimitador compatível com Excel brasileiro e proteção contra fórmulas;
- PDF A4 retrato/paisagem com logotipo opcional, todas as colunas, paginação, totais, aviso de truncamento e limite seguro;
- impressão direta da prévia com orientação adequada e auditoria de toda exportação PDF/CSV;
- migração 0009 com índices para liquidações por forma/data, histórico de contato/competência e itens vendidos;
- limites de período, paginação e exportação para proteger legibilidade e desempenho em bases extensas;
- 48 testes Rust, 20 testes Vitest e 17 cenários Playwright aprovados; lint, tipos, Clippy, auditoria npm, Vite e Tauri aprovados;
- executável, MSI e NSIS x64 gerados e PDF de aceite renderizado e inspecionado visualmente.

O aceite detalhado e a fronteira preservada para a Fase 8 estão em [docs/phase-7-acceptance.md](docs/phase-7-acceptance.md).

## 18. Progresso — Fase 8

Status: **100% concluída em 05/08/2026**.

- backup manual íntegro com banco, preferências, logotipo, manifesto, versão, data e checksums;
- proteção opcional autenticada por senha com Argon2id e XChaCha20-Poly1305, sem armazenar a senha;
- compatibilidade mantida com backups antigos não protegidos;
- backup automático local diário, semanal ou mensal, pasta configurável, execução quando vencido e retenção de 1 a 120 cópias;
- histórico persistente de backups manuais, automáticos, preventivos e falhas;
- restauração orientada com inspeção, senha opcional, backup preventivo, migrações, `quick_check`, chaves estrangeiras, auditoria, reinício e rollback do banco anterior;
- diagnóstico `.cncdiag` voluntário com versão, SO, arquitetura, migrações, integridade e logs recentes limitados, sem incluir o banco financeiro;
- licenciamento offline permanente por versão principal, edição, cliente, instalação e assinatura Ed25519 preservado e integrado;
- atualização offline `.cncupd` com versão semântica, assinatura Ed25519, SHA-256 do instalador, compatibilidade de licença, backup preventivo e validação pós-inicialização;
- empacotador interno de atualizações com chave privada externa ao repositório e instalador;
- migração 0010 para histórico, retenção, último backup e atualizações;
- 55 testes Rust, 23 testes Vitest e 19 cenários Playwright aprovados; lint, tipos, Clippy, auditoria npm, Vite e Tauri aprovados;
- executável, MSI e NSIS x64 gerados e backup protegido de aceite restaurado em teste.

O aceite detalhado e a fronteira preservada para a Fase 9 estão em [docs/phase-8-acceptance.md](docs/phase-8-acceptance.md).

## 19. Progresso — Fase 9

Status: **100% concluída em 06/08/2026**.

- matriz automatizada com testes de domínio, integração, E2E e acessibilidade WCAG 2 A/AA sobre os fluxos das Fases 2 a 9;
- navegação por teclado com link de salto, foco visível em todos os controles, regiões roláveis focáveis, alvos de 44 px, modais com foco contido, Escape e restauração do foco;
- menu responsivo em formato de gaveta, sem corte horizontal em 720 px, e respeito a preferência de movimento reduzido;
- revisão de contraste e estados sem dependência exclusiva de cor, com mensagens de sucesso/erro anunciadas por tecnologias assistivas;
- erros técnicos convertidos em orientação compreensível, barreira global de falhas e recuperação segura sem registrar dados sensíveis;
- migração 0011 com índices compostos para situação/data, conta, categoria, origem, ordenação de contatos, catálogo e número/data de vendas;
- SQLite com espera limitada para concorrência e memória temporária, mantendo WAL, sincronização completa e integridade referencial;
- carga temporária isolada com 50.000 movimentações, 10.000 contatos, 10.000 itens e mais de cinco anos de datas; consultas críticas em 8 ms na execução de aceite;
- revisão de cálculos com invariantes para todos os parcelamentos de 1 a 120 vezes, valor mínimo por parcela, soma exata, centavos na última, limites inteiros, liquidações, transferências, estornos, caixa e competência;
- auditoria visual comparativa do dashboard e dos breakpoints desktop/compacto, com evidências em `docs/phase-9-audit`;
- 57 testes Rust, 28 testes Vitest e 23 cenários Playwright aprovados, incluindo varreduras de acessibilidade nos módulos principais;
- lint, tipos, Vite, `cargo fmt`, Clippy, testes completos, auditoria npm e build Tauri aprovados.

O aceite detalhado e as evidências estão em [docs/phase-9-acceptance.md](docs/phase-9-acceptance.md).
