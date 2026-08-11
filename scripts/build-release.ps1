param(
  [switch]$SkipQuality,
  [switch]$QualityAlreadyPassed,
  [switch]$SkipBuild,
  [switch]$SkipSmoke
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root
$version = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
$bundleVersion = (Get-Content (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json).version

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
$nsis = Get-ChildItem -LiteralPath (Join-Path $bundle "nsis") -Filter "*$bundleVersion*setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$msi = Get-ChildItem -LiteralPath (Join-Path $bundle "msi") -Filter "*$bundleVersion*.msi" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $nsis -or -not $msi) { throw "Instaladores NSIS/MSI não encontrados." }

if (-not $SkipSmoke) {
  & (Join-Path $PSScriptRoot "installer-smoke.ps1") -NsisInstaller $nsis.FullName -MsiInstaller $msi.FullName
}

$release = Join-Path $root "dist\releases\$version"
New-Item -ItemType Directory -Force -Path $release | Out-Null
$installerName = "CaixaSimples-Bratec-$version-Setup.exe"
$msiName = "CaixaSimples-Bratec-$version-x64.msi"
Copy-Item -LiteralPath $nsis.FullName -Destination (Join-Path $release $installerName) -Force
Copy-Item -LiteralPath $msi.FullName -Destination (Join-Path $release $msiName) -Force
$files = @(
  (Join-Path $root "output\manual\Manual-do-Usuario-CaixaSimples-Bratec.pdf"),
  (Join-Path $root "output\manual\Manual-do-Usuario-CaixaSimples-Bratec.docx"),
  (Join-Path $root "src-tauri\resources\EULA.rtf"),
  (Join-Path $root "CHANGELOG.md"),
  (Join-Path $root "docs\release-checklist.md"),
  (Join-Path $root "docs\windows-clean-install.md"),
  (Join-Path $root "RELEASE_NOTES_1.2.0-beta.1.md"),
  (Join-Path $root "docs\BETA_INSTALLER_NOTICE.txt")
)
foreach ($file in $files) {
  if (-not (Test-Path -LiteralPath $file)) { throw "Artefato ausente: $file" }
  Copy-Item -LiteralPath $file -Destination $release -Force
}

$releaseFiles = Get-ChildItem -LiteralPath $release -File | Where-Object Name -NotIn @("RELEASE_MANIFEST.json", "SHA256SUMS.txt")
$hashLines = foreach ($file in $releaseFiles) {
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $($file.Name)"
}
$hashLines | Set-Content -LiteralPath (Join-Path $release "SHA256SUMS.txt") -Encoding ascii

$signatures = foreach ($installer in @($nsis, $msi)) {
  $signature = Get-AuthenticodeSignature -LiteralPath $installer.FullName
  [ordered]@{ file = $installer.Name; status = $signature.Status.ToString(); signer = $signature.SignerCertificate.Subject }
}
$primary = Get-Item -LiteralPath (Join-Path $release $installerName)
$primaryHash = (Get-FileHash -LiteralPath $primary.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$signed = ($signatures | Where-Object status -ne "Valid").Count -eq 0
$manifest = [ordered]@{
  product = "CaixaSimples - Bratec"
  publisher = "BratecInfo"
  version = $version
  channel = "beta"
  filename = $installerName
  sha256 = $primaryHash
  sizeBytes = $primary.Length
  buildDate = [DateTime]::UtcNow.ToString("o")
  signed = $signed
  platform = "windows-x64"
  databaseSchema = 13
  offlineCore = $true
  commercialActivation = "online-with-signed-offline-lease"
  webView2 = "offlineInstaller"
  signatures = $signatures
  checksums = "SHA256SUMS.txt"
  qualityGate = if ($QualityAlreadyPassed -or -not $SkipQuality) { "passed" } else { "not-run-by-this-invocation" }
  installerSmoke = if ($SkipSmoke) { "not-run-by-this-invocation" } else { "passed" }
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $release "RELEASE_MANIFEST.json") -Encoding UTF8
Write-Host "Release concluído em $release"
