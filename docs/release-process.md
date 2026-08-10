# Processo de release

## Pré-requisitos

- Windows 10/11 x64 atualizado;
- Node.js 24+, npm e Rust estável com MSVC;
- Visual Studio Build Tools com C++ para desktop;
- acesso à internet apenas na máquina de build para baixar dependências e o instalador offline do WebView2;
- backend comercial HTTPS implantado e validado em sandbox;
- certificado de assinatura de código obrigatório para uma release comercial, configurado fora do repositório.

## Geração reproduzível

Execute na raiz:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1
```

O script executa lint, tipagem, testes unitários, E2E, verificação de acessibilidade, desempenho, `cargo fmt`, `cargo clippy`, `cargo test`, build Tauri, smoke test dos instaladores, cópia dos artefatos e SHA-256. O resultado fica no subdiretório da versão em `output/release`.

Compile a URL pública no binário sem segredo:

```powershell
$env:CNC_COMMERCIAL_API_URL="https://commercial.seu-dominio.com"
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1
```

## Assinatura digital

Sem certificado comercial, o pacote é somente **candidato técnico não vendável**, ainda que acompanhado por checksums. Configure `signtool` pela infraestrutura segura da BratecInfo; não registre certificado, senha ou token no Git. Valide a assinatura do executável, MSI e NSIS depois da geração e antes de publicar. O manifesto deve registrar o estado real.

Para uma release comercial, use o script fail-closed, informando a URL real e o thumbprint do certificado instalado:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-production-release.ps1 `
  -CommercialApiUrl "https://commercial.seu-dominio.com" `
  -CertificateThumbprint "THUMBPRINT_DO_CERTIFICADO"
```

O processo recusa hosts fictícios, certificado expirado/sem chave privada e qualquer artefato cuja assinatura final não seja `Valid`.

## Atualização e reversão

Antes de atualizar, crie e valide um backup. Instale a nova versão sobre a anterior, confirme a migração e valide `PRAGMA quick_check`. A reversão de binário não deve ser usada sobre um banco migrado para versão mais nova; restaure o backup preventivo compatível.

## Ambiente limpo

Consulte `docs/windows-clean-install.md`. A validação cobre NSIS e extração administrativa do MSI, dependência offline, inicialização, onboarding, persistência, atualização e desinstalação com preservação de dados.
