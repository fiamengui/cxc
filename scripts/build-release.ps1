param(
  [switch]$SkipQuality,
  [switch]$SkipBuild,
  [switch]$SkipSmoke
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root
$version = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version

if (-not $SkipQuality) {
  npm run lint
  if ($LASTEXITCODE -ne 0) { throw "Lint falhou." }
  npm run typecheck
  if ($LASTEXITCODE -ne 0) { throw "Tipagem falhou." }
  npm run test:run
  if ($LASTEXITCODE -ne 0) { throw "Testes unitários frontend falharam." }
  npm run test:licenses
  if ($LASTEXITCODE -ne 0) { throw "Testes do emissor de licenças falharam." }
  npm run test:e2e
  if ($LASTEXITCODE -ne 0) { throw "Testes E2E falharam." }
  npm run test:performance
  if ($LASTEXITCODE -ne 0) { throw "Teste de desempenho falhou." }
  cargo fmt --manifest-path src-tauri\Cargo.toml --all -- --check
  if ($LASTEXITCODE -ne 0) { throw "cargo fmt falhou." }
  cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets -- -D warnings
  if ($LASTEXITCODE -ne 0) { throw "cargo clippy falhou." }
  cargo test --manifest-path src-tauri\Cargo.toml --all-targets
  if ($LASTEXITCODE -ne 0) { throw "Testes Rust falharam." }
}

if (-not $SkipBuild) {
  npm run tauri:build
  if ($LASTEXITCODE -ne 0) { throw "Build Tauri falhou." }
}

$bundle = Join-Path $root "src-tauri\target\release\bundle"
$nsis = Get-ChildItem -LiteralPath (Join-Path $bundle "nsis") -Filter "*setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$msi = Get-ChildItem -LiteralPath (Join-Path $bundle "msi") -Filter "*.msi" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $nsis -or -not $msi) { throw "Instaladores NSIS/MSI não encontrados." }

if (-not $SkipSmoke) {
  & (Join-Path $PSScriptRoot "installer-smoke.ps1") -NsisInstaller $nsis.FullName -MsiInstaller $msi.FullName
}

$release = Join-Path $root "output\release\$version"
New-Item -ItemType Directory -Force -Path $release | Out-Null
$files = @(
  $nsis.FullName,
  $msi.FullName,
  (Join-Path $root "output\manual\Manual-do-Usuario-Caixa-no-Controle.pdf"),
  (Join-Path $root "output\manual\Manual-do-Usuario-Caixa-no-Controle.docx"),
  (Join-Path $root "src-tauri\resources\EULA.rtf"),
  (Join-Path $root "CHANGELOG.md"),
  (Join-Path $root "docs\release-checklist.md"),
  (Join-Path $root "docs\windows-clean-install.md")
)
foreach ($file in $files) {
  if (-not (Test-Path -LiteralPath $file)) { throw "Artefato ausente: $file" }
  Copy-Item -LiteralPath $file -Destination $release -Force
}

$releaseFiles = Get-ChildItem -LiteralPath $release -File | Where-Object Name -NotIn @("release-manifest.json", "SHA256SUMS.txt")
$hashLines = foreach ($file in $releaseFiles) {
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $($file.Name)"
}
$hashLines | Set-Content -LiteralPath (Join-Path $release "SHA256SUMS.txt") -Encoding ascii

$signatures = foreach ($installer in @($nsis, $msi)) {
  $signature = Get-AuthenticodeSignature -LiteralPath $installer.FullName
  [ordered]@{ file = $installer.Name; status = $signature.Status.ToString(); signer = $signature.SignerCertificate.Subject }
}
$manifest = [ordered]@{
  product = "Caixa no Controle"
  publisher = "BratecInfo"
  version = $version
  releasedAtUtc = [DateTime]::UtcNow.ToString("o")
  platform = "windows-x64"
  databaseSchema = 13
  offlineCore = $true
  commercialActivation = "online-with-signed-offline-lease"
  webView2 = "offlineInstaller"
  signatures = $signatures
  checksums = "SHA256SUMS.txt"
  qualityGate = if ($SkipQuality) { "not-run-by-this-invocation" } else { "passed" }
  installerSmoke = if ($SkipSmoke) { "not-run-by-this-invocation" } else { "passed" }
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $release "release-manifest.json") -Encoding UTF8
Write-Host "Release concluído em $release"
