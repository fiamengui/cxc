param(
  [Parameter(Mandatory = $true)][string]$CommercialApiUrl,
  [switch]$SkipQuality,
  [switch]$SkipSmoke
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$uri = $null
if (-not [Uri]::TryCreate($CommercialApiUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne "https") {
  throw "CommercialApiUrl deve ser uma URL HTTPS absoluta."
}
if ($uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.Host -in @("localhost", "127.0.0.1") -or $uri.Host.EndsWith(".invalid")) {
  throw "A beta de produção não aceita credenciais na URL, host local ou fictício."
}

$commercialBaseUrl = $uri.AbsoluteUri.TrimEnd("/")
if ($uri.Host -match "sandbox|test") {
  try {
    $health = Invoke-RestMethod -Uri "$commercialBaseUrl/health" -Method Get -TimeoutSec 120
  } catch {
    throw "O host legado só pode ser usado após validar o endpoint HTTPS: $($_.Exception.Message)"
  }
  if ($health.status -ne "ok" -or $health.environment -ne "production" -or $health.releaseChannel -ne "beta" -or $health.version -ne "1.2.0-beta.1") {
    throw "O host legado não comprovou status ok, ambiente production, canal beta e versão 1.2.0-beta.1."
  }
}

$env:CNC_COMMERCIAL_API_URL = $commercialBaseUrl
$env:CNC_BUILD_ENVIRONMENT = "Production Beta"
$env:CNC_RELEASE_CHANNEL = "beta"
$env:CNC_BUILD_ID = [DateTime]::UtcNow.ToString("yyyyMMdd.HHmmss")
Set-Location $root

if (-not $SkipQuality) {
  npm run lint
  if ($LASTEXITCODE -ne 0) { throw "Lint falhou." }
  npm run typecheck
  if ($LASTEXITCODE -ne 0) { throw "Tipagem falhou." }
  npm run test:run
  if ($LASTEXITCODE -ne 0) { throw "Testes unitários falharam." }
  npm run test:licenses
  if ($LASTEXITCODE -ne 0) { throw "Testes do emissor de licenças falharam." }
  npm run test:e2e
  if ($LASTEXITCODE -ne 0) { throw "Testes E2E falharam." }
  npm run test:performance
  if ($LASTEXITCODE -ne 0) { throw "Teste de desempenho falhou." }
  Push-Location (Join-Path $root "commercial-backend")
  try { npm run lint; if ($LASTEXITCODE -ne 0) { throw "Lint do backend falhou." }; npm test; if ($LASTEXITCODE -ne 0) { throw "Testes do backend falharam." } } finally { Pop-Location }
  cargo fmt --manifest-path src-tauri\Cargo.toml --all -- --check
  if ($LASTEXITCODE -ne 0) { throw "cargo fmt falhou." }
  cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets -- -D warnings
  if ($LASTEXITCODE -ne 0) { throw "cargo clippy falhou." }
  cargo test --manifest-path src-tauri\Cargo.toml --all-targets
  if ($LASTEXITCODE -ne 0) { throw "Testes Rust falharam." }
}

npm run tauri:build
if ($LASTEXITCODE -ne 0) { throw "Build Tauri da beta falhou." }

& (Join-Path $PSScriptRoot "build-release.ps1") -SkipQuality -QualityAlreadyPassed:$(-not $SkipQuality) -SkipBuild -SkipSmoke:$SkipSmoke
if ($LASTEXITCODE -ne 0) { throw "Empacotamento da beta falhou." }
Write-Host "Beta de produção gerada sem assinatura digital."
