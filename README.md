# CaixaSimples - Bratec

Aplicação desktop offline para gestão financeira simples de pequenos negócios, desenvolvida pela BratecInfo.

## Estado atual

A versão `1.2.0-beta.1` preserva integralmente a base `1.1.0` e prepara a distribuição controlada sob a identidade CaixaSimples - Bratec. A plataforma comercial mantém plano mensal de R$ 9,90, anual de R$ 99,90, checkout hospedado no Mercado Pago, backend PostgreSQL separado, identidade Ed25519 protegida por DPAPI e autorização offline temporária assinada. O trial continua com 50 operações e todos os dados permanecem consultáveis após o limite.

## Requisitos

- Windows 10 ou 11, 64 bits;
- Node.js 24+ e npm;
- Rust estável com alvo `x86_64-pc-windows-msvc`;
- WebView2 Runtime (normalmente já presente no Windows 10/11).

## Desenvolvimento

```powershell
npm install
npm run tauri:dev
```

Em computadores com Controle de Aplicativo do Windows, configure um diretório de build aprovado antes de executar comandos Rust:

```powershell
$env:CARGO_TARGET_DIR = "$env:LOCALAPPDATA\CaixaNoControle\cargo-target"
```

## Verificação

```powershell
npm run lint
npm run typecheck
npm run test:run
npm run test:e2e
npm run test:a11y
npm run test:performance
Set-Location src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
```

## Build e instalador

```powershell
npm run tauri:build
```

O Tauri gera os pacotes MSI e NSIS no subdiretório `release/bundle` de `CARGO_TARGET_DIR` (ou em `src-tauri/target/release/bundle`, se a variável não estiver definida).

Para executar toda a porta de qualidade, validar os instaladores e montar o pacote versionado:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1
```

O release final fica no subdiretório da versão em `output/release`. A assinatura Authenticode é aplicada somente quando a BratecInfo disponibilizar um certificado comercial fora do repositório; sem ele, confira `SHA256SUMS.txt`.

## Dados locais

- Banco (nome interno preservado para upgrades): `%APPDATA%\br.com.bratecinfo.caixanocontrole\caixa-no-controle.db`
- Logs: `%LOCALAPPDATA%\br.com.bratecinfo.caixanocontrole\logs`

Os valores financeiros são armazenados exclusivamente como inteiros em centavos. O banco local não deve ser editado manualmente.

O desinstalador preserva os dados por padrão e pergunta separadamente antes da remoção permanente.
