# Emissor interno de licenças BratecInfo

Ferramenta administrativa exclusiva da BratecInfo. Ela não integra os recursos do Tauri nem o instalador do cliente. O aplicativo comercial contém apenas a chave pública Ed25519.

## Arquivos privados

- chave privada de produção: `C:\Users\joaop\BratecInfo-Secure\CaixaNoControle\license-production-ed25519.pem`;
- sugestão para o registro administrativo: `C:\Users\joaop\BratecInfo-Secure\CaixaNoControle\licenses.json`;
- sugestão para as licenças emitidas: `C:\Users\joaop\BratecInfo-Secure\CaixaNoControle\emitidas`.

Faça uma cópia segura e offline da chave privada. Perdê-la impede novas emissões compatíveis; expô-la exige trocar a chave pública numa nova versão do produto. Nunca copie a chave para o repositório, instalador, backup do cliente ou pacote de suporte.

## Interface local

```powershell
$env:BRATEC_LICENSE_PRIVATE_KEY='C:\Users\joaop\BratecInfo-Secure\CaixaNoControle\license-production-ed25519.pem'
$env:BRATEC_LICENSE_REGISTRY='C:\Users\joaop\BratecInfo-Secure\CaixaNoControle\licenses.json'
$env:BRATEC_LICENSE_OUTPUT='C:\Users\joaop\BratecInfo-Secure\CaixaNoControle\emitidas'
node scripts\license-generator\server.mjs
```

Abra `http://127.0.0.1:47831`. O servidor aceita somente conexões locais. A tela gera o ID sequencial `CNC-00000001`, assina o arquivo `.cnclic`, registra seu SHA-256 e permite marcar a licença como ativa, reemitida ou revogada administrativamente. A revogação é somente cadastral porque a validação do cliente é totalmente offline.

## Linha de comando

```powershell
node scripts\license-generator\generate-license.mjs --key <chave.pem> --registry <licenses.json> --output <pasta> --customer "Cliente" --installation CNC-ABCD-1234-EF56 --edition ESSENTIAL --major 1
```

Campos opcionais: `--document`, `--email`, `--notes` e `--reissue CNC-00000001`.

O documento assinado contém ID, cliente, documento/e-mail opcionais, produto, edição, versão principal autorizada, código da instalação, emissão, limite de um dispositivo, recursos, versão do esquema e observações opcionais.
