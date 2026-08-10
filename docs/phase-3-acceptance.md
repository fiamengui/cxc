# Aceite da Fase 3 — Cadastros

Status: **100% concluída em 04/08/2026**.

| Item do escopo | Evidência implementada |
| --- | --- |
| Contatos | CRUD real de pessoas e empresas; cliente, fornecedor ou ambos; documento, telefones, e-mail, endereço, observações e tags |
| Lista e pesquisa | Busca no SQLite por nome, fantasia, documento, telefone e WhatsApp; filtros por papel e situação; paginação e estados vazio/erro/carregamento |
| Detalhes | Abas Resumo, Vendas, Contas a receber, Contas a pagar, Movimentações, Observações e Histórico |
| Duplicidades | Detecção por documento, telefone/WhatsApp, e-mail e nome, antes do salvamento e durante a importação |
| CSV | Modelo, seleção, prévia, mapeamento, validação, relatório por linha, confirmação, importação atômica e exportação filtrada |
| Segurança do CSV | Limites de 10 MB e 10.000 linhas, BOM/delimitador tratados e exportação protegida contra fórmulas de planilha |
| Categorias | Receita/despesa, hierarquia, cor, ícone, busca, edição, inativação, proteção de ciclos, dependências e duplicidades por nível |
| Contas financeiras | Tipo, instituição, saldo/data inicial, cor, conta padrão única e proteção contra remoção indevida do padrão |
| Formas de pagamento | Tipo, taxa em pontos-base, prazo de recebimento, formas do sistema protegidas e opções Prazo/Outro |
| Produtos e serviços | Código, nome, tipo, categoria, venda, custo opcional, unidade, busca, filtros, paginação e inativação; sem controle de estoque |
| Integridade histórica | Preços do catálogo são valores atuais; a interface informa que alterações não modificarão vendas antigas quando a Fase 5 criar seus itens imutáveis |
| Auditoria | Criar, editar, ativar, inativar, excluir e importar geram auditoria; registros mestres armazenam `created_by` e `updated_by` |
| Persistência | React → adaptador TypeScript → comando Tauri → serviço Rust → SQLite, com UUIDs, centavos, transações e consultas parametrizadas |

## Validação executada

- `npm run lint`: aprovado sem avisos;
- `npm run typecheck`: aprovado;
- `npm run test:run`: 6 testes aprovados;
- `npm run build`: aprovado;
- `npm run test:e2e`: 6 cenários aprovados, incluindo busca, inativação, histórico e assistente CSV;
- `npm audit`: zero vulnerabilidades conhecidas;
- `cargo fmt --all -- --check`: aprovado;
- `cargo clippy --all-targets -- -D warnings`: aprovado;
- `cargo test --all-targets`: 20 testes aprovados;
- `npm run tauri:build`: executável, MSI e NSIS x64 gerados;
- executável de produção iniciado com sucesso; migração 0005 aplicada, seis índices confirmados e `PRAGMA quick_check` igual a `ok`.

## Fronteira com as próximas fases

As abas financeiras do contato e seus totais exibem o estado vazio real enquanto ainda não existem lançamentos, vendas, recebíveis ou pagamentos. Elas serão alimentadas pelas tabelas das Fases 4 e 5 sem alterar o cadastro entregue nesta fase. Isso é uma dependência de integração futura, não uma pendência da Fase 3.
