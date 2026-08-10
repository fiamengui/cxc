# Changelog

## 1.2.0-beta.1 — 2026-08-10

- adota a identidade visual CaixaSimples - Bratec, preservando identificadores persistidos necessários para upgrades e dados existentes;
- inicia o canal beta controlado sobre a base estável 1.1.0, sem downgrade de versão;
- atualiza aplicação, instaladores, manual, documentação, relatórios, backups e metadados visíveis;
- regenera e valida visualmente o manual do usuário em DOCX e PDF;
- mantém a migration comercial histórica e o nome interno do SQLite intactos por compatibilidade.

## 1.1.0 — 2026-08-07

- migra novas vendas para assinatura Essencial mensal de R$ 9,90 e anual de R$ 99,90, preservando `.cnclic` apenas para clientes legados;
- adiciona backend TypeScript/PostgreSQL separado, planos server-side, checkout recorrente Mercado Pago, webhook HMAC idempotente e confirmação server-to-server;
- adiciona identidade Ed25519 por dispositivo protegida com DPAPI, challenge-response de uso único e entitlement Ed25519 com lease, sequência e horário confiável;
- adiciona interface Meu plano, checkout hospedado, confirmação, estados de assinatura e alertas progressivos do trial;
- reduz ACL do Tauri, endurece build Rust, adiciona CI, modelo de ameaças, auditoria e documentação operacional;
- remove a promoção de estado SQLite `ACTIVE` sem assinatura, impedindo que metadados locais sejam autoridade comercial.

## 1.0.2 — 2026-08-07

- consolida o trial permanente de 50 operações, sem expiração por data, com estado `TRIAL_LIMIT_REACHED` e consultas preservadas;
- corrige a contagem por ação de alto nível: parcelamentos, vendas parceladas e transferências consomem uma única movimentação;
- adiciona guard financeiro central no backend, feature flags centralizadas e mensagem comercial com ativação offline;
- substitui o UUID visível pelo código de instalação `CNC-XXXX-XXXX-XXXX` sem identificação de hardware;
- adiciona licença comercial Ed25519 por produto, instalação, edição, versão principal, esquema e recursos;
- impede clonagem de licença por backup e rollback casual do contador por restauração ou reinstalação comum;
- entrega emissor BratecInfo local separado, com IDs sequenciais, registro administrativo, hash, reemissão e status;
- documenta trial, licenciamento, segurança da chave privada, processo comercial e limitações deliberadas.

## 1.0.1 — 2026-08-07

- corrige a abertura do manual embarcado pela Central de Ajuda;
- move a operação para um comando Tauri nativo, evitando liberar acesso genérico a arquivos na ACL do frontend;
- mantém o manual acessível pelo leitor de PDF padrão do Windows.

## 1.0.0 — 2026-08-06

- distribuição Windows profissional em NSIS e MSI, português do Brasil, EULA, atalhos e WebView2 offline;
- desinstalação com preservação padrão e confirmação separada para apagar dados;
- Central de Ajuda pesquisável e manual offline em DOCX/PDF;
- pacote demonstrativo transacional completo, identificado, auditado e removível;
- migração 0012 para rastreamento seguro de dados demonstrativos financeiros e comerciais;
- automação de release, smoke test dos instaladores, checksums SHA-256 e manifesto de assinatura;
- documentação de build limpo, atualização, suporte e checklist final.

## [0.1.0] - 2026-08-04

### Adicionado

- Fundação desktop Tauri 2 com React, TypeScript estrito e Tailwind CSS;
- banco SQLite local com migrações versionadas, WAL e integridade referencial;
- logs rotativos e comandos Tauri mínimos;
- ícones e empacotamento Windows MSI/NSIS;
- boas-vindas e onboarding completo de 9 etapas com usuário administrador protegido por Argon2id;
- trial de 7 dias ou 50 movimentações e dados demonstrativos identificados/removíveis;
- ativação offline Ed25519 com ferramenta interna separada e vínculo opcional à instalação;
- backup e restauração manual com checksums, cópia preventiva, migrações, auditoria e reinício;
- cadastros completos de clientes e fornecedores, com papéis, etiquetas, detalhes, pesquisa, paginação, duplicidades, inativação e histórico;
- importação CSV de contatos com modelo, leitura de BOM e delimitador, mapeamento, prévia, validação, relatório de erros, confirmação de duplicidades e transação atômica;
- exportação CSV filtrada e protegida contra injeção de fórmulas;
- CRUD de categorias hierárquicas, contas financeiras e formas de pagamento, com proteção de ciclos, duplicidades, conta padrão e registros do sistema;
- catálogo de produtos e serviços sem estoque, com preços em centavos, custo opcional, filtros e exclusão lógica;
- auditoria de criação, alteração, ativação, inativação, exclusão e importação, com `created_by` e `updated_by`;
- migração 0005 com índices de pesquisa e situação, autoria e formas Prazo/Outro;
- testes de domínio, interface e fluxos E2E da Fase 3, além dos instaladores MSI e NSIS atualizados.
- migração 0006 com grupos financeiros, recorrências, movimentações, eventos de liquidação e índices para datas, situação, tipo, contato, categoria, conta, origem e geração recorrente;
- núcleo financeiro completo para receitas, despesas, aportes, retiradas, ajustes, rascunhos, pendências e liquidações;
- liquidação total ou parcial com desconto, taxa, juros, multa, valor efetivo, conta, forma de pagamento e histórico, preservando o valor original;
- parcelamento em até 120 vezes, vencimentos editáveis, centavos restantes na última parcela e vínculo por grupo;
- recorrências semanais, mensais, bimestrais, trimestrais, semestrais e anuais, com limite/data final, ativação, pausa automática de modelo inválido e datas ancoradas em meses curtos;
- transferências em duas pontas vinculadas e neutras no resultado, incluindo estorno integral das duas contas;
- cancelamento de pendências e estorno auditável de liquidações sem exclusão do histórico;
- listagem financeira paginada com abas, filtros, detalhe, liquidações, histórico, duplicação, reagendamento e impressão;
- telas antecipadas de contas a receber, contas a pagar e fluxo de caixa para conciliar saldo, caixa, competência e projeções da Fase 4;
- integração financeira no detalhe de contatos e proteção de cadastros referenciados;
- 35 testes Rust, 10 testes Vitest e 11 cenários Playwright aprovados, com executável, MSI e NSIS atualizados para a Fase 4.
- migração 0007 com vendas, itens imutáveis, vínculos ao núcleo financeiro e índices por número, data, situação, cliente e catálogo;
- módulo comercial completo com rascunho, confirmação, pesquisa, filtros, paginação, detalhe, duplicação e histórico auditável;
- itens do catálogo ou avulsos com quantidade de três casas decimais, preço praticado congelado, desconto por item e cálculos monetários em centavos;
- recebimento imediato, futuro, parcelado ou misto, com parcelas exatas, resto na última e geração atômica/idempotente no contas a receber;
- sincronização automática da venda após baixas totais/parciais e estornos, bloqueio de cancelamento enquanto houver recebimento ativo e cancelamento das pendências sem apagar histórico;
- comprovante não fiscal com empresa, marca, cliente, venda, itens, valores, pagamento, observações e aviso legal, disponível para impressão e PDF local real;
- integração das vendas com contatos, contas a receber e proteção dos cadastros usados pelo histórico;
- 41 testes Rust, 14 testes Vitest e 13 cenários Playwright aprovados, zero vulnerabilidades npm, executável, MSI e NSIS atualizados para a Fase 5.
- migração 0008 com autoria das metas mensais, referência `YYYY-MM` normalizada e índices para liquidações, novos clientes e metas;
- dashboard gerencial com oito indicadores, comparação histórica, barras de entradas/saídas, evolução do saldo, despesas por categoria, meta mensal e cinco listas rápidas navegáveis;
- contas a receber e pagar concluídas com indicadores, filtros, totalização, paginação, ações de baixa, edição, reagendamento, duplicação, cancelamento e vínculos contextuais;
- mensagem de cobrança editável e copiada localmente, sem qualquer envio automático;
- fluxo diário realizado por caixa/competência e projeção opcional de pendências até uma data, visualmente diferenciada do saldo real;
- metas mensais de faturamento, limite de despesas, resultado, vendas e novos clientes, com realizado, percentual, diferença, comparação e ritmo diário;
- carregamento sob demanda dos módulos, reduzindo o JavaScript inicial para 346,84 kB;
- 44 testes Rust, 18 testes Vitest e 15 cenários Playwright aprovados, zero vulnerabilidades npm, executável, MSI e NSIS atualizados para a Fase 6.
- migração 0009 com índices de relatórios por liquidação, contato, competência e itens vendidos;
- central pesquisável com 17 relatórios financeiros, gerenciais, de obrigações, relacionamentos e vendas;
- filtros completos, regimes de caixa/competência, ordenação, paginação, totais e pré-visualização acessível;
- exportação CSV UTF-8 segura, PDF A4 retrato/paisagem com logotipo opcional e impressão da prévia;
- reconciliação de liquidações parciais, estornos, recebíveis/pagáveis e resultados nos dois regimes;
- auditoria das exportações e limites de segurança para períodos, linhas e legibilidade;
- 48 testes Rust, 20 testes Vitest e 17 cenários Playwright aprovados, zero vulnerabilidades npm, executável, MSI e NSIS atualizados para a Fase 7.
- migração 0010 com histórico de backups, retenção, último backup e controle de atualizações;
- backups manuais e automáticos com política diária/semanal/mensal, retenção segura e histórico de falhas;
- proteção opcional por senha usando Argon2id e XChaCha20-Poly1305, sem senha persistida e com compatibilidade retroativa;
- restauração com backup preventivo, migrações, integridade, vínculos, auditoria, reinício e rollback pós-migração;
- pacote de diagnóstico local sem banco financeiro e sem qualquer telemetria ou envio automático;
- atualizações offline assinadas, verificação semântica, checksum do instalador, licença por versão principal e backup prévio;
- ferramenta interna separada para criar `.cncupd` mantendo a chave privada fora do produto;
- 55 testes Rust, 23 testes Vitest e 19 cenários Playwright aprovados, zero vulnerabilidades npm, executável, MSI e NSIS atualizados para a Fase 8.
- migração 0011 com índices compostos para consultas financeiras, contatos, catálogo e vendas em bases extensas;
- validação automatizada com 50 mil movimentações, 10 mil contatos, 10 mil itens e mais de cinco anos de registros;
- acessibilidade WCAG 2 A/AA com navegação por teclado, foco visível, link de salto, modais contidos, regiões roláveis focáveis, contraste e movimento reduzido;
- menu responsivo sem corte horizontal, auditoria visual desktop/compacta e prévia de qualidade restrita ao desenvolvimento;
- barreira global de falhas, mensagens técnicas transformadas em orientação segura e espera controlada para concorrência SQLite;
- invariantes financeiros de parcelamento de 1 a 120 vezes e regressão de liquidações, transferências, estornos, caixa e competência;
- 57 testes Rust, 28 testes Vitest e 23 cenários Playwright aprovados para a Fase 9.
