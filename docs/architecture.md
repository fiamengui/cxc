# Arquitetura da fundação

## Camadas

| Camada | Responsabilidade |
| --- | --- |
| `src/app`, `src/features`, `src/components` | Interface e fluxo do usuário |
| `src/infrastructure` | Adaptadores tipados para comandos Tauri |
| `src/domain` | Regras puras compartilháveis e testáveis |
| `src-tauri/src/application` | Casos de uso e validação de servidor local |
| `src-tauri/src/database` | Acesso SQLite e migrações |
| `src-tauri/src/logging` | Logs rotativos sem dados sensíveis |

## Persistência

O banco é criado no diretório de dados do aplicativo. A cada abertura, as migrações ainda não registradas em `app_migrations` são executadas transacionalmente. SQLite usa `foreign_keys = ON`, `journal_mode = WAL` e `synchronous = FULL`.

## Erros

O backend retorna mensagens seguras para a interface e grava contexto técnico no log rotativo. Não há ocultação silenciosa de falhas.

## Integração comercial e financeira

O módulo de vendas é o proprietário da confirmação e do cancelamento comercial. Ele reutiliza o serviço financeiro dentro da mesma transação SQLite para gerar os recebíveis com `origin_type = SALE`, `origin_id` e grupo único. Baixas e estornos permanecem no núcleo financeiro, que sincroniza a situação da venda; movimentações originadas por venda não podem ser editadas ou canceladas isoladamente pela interface financeira.

## Entitlement comercial

`application::entitlements` é o ponto central para edição, recursos e autorização de novas operações financeiras. O fluxo permanece `React → serviço TypeScript → comando Tauri → serviço Rust → SQLite`. O estado comercial externo ao backup guarda o maior uso do trial e o documento assinado; o banco recebe uma projeção reconciliada para consultas e transações atômicas. A chave privada Ed25519 existe somente na ferramenta administrativa separada.
