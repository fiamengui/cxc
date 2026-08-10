# Convenções do projeto

## Arquitetura

O fluxo obrigatório é `React → serviço de aplicação → comando Tauri → serviço/repositório Rust → SQLite`. Componentes React nunca executam SQL; comandos Tauri não devem conter regras financeiras complexas.

## Dados e segurança

- UUIDs para entidades de negócio;
- moeda como inteiro em centavos, nunca `float`;
- datas de negócio em `YYYY-MM-DD`; auditoria em UTC;
- exclusão lógica para entidades de negócio;
- consultas SQL parametrizadas;
- nunca registrar senhas, chaves privadas ou valores financeiros detalhados em logs;
- toda senha local deve usar Argon2id;
- chave privada de licença nunca entra no repositório nem no instalador.

## Qualidade antes de concluir uma fase

Execute lint, tipagem, testes unitários, E2E aplicável, `cargo fmt`, `cargo clippy`, `cargo test` e build Tauri. Não declare uma funcionalidade pronta sem interface, persistência, validação, estado vazio, feedback de erro e teste proporcional ao risco.

## Git

Não descarte alterações existentes. Commits futuros devem ter escopo pequeno e descrição em português ou inglês claro.
