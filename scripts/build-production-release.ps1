param(
  [Parameter(Mandatory = $true)][string]$CommercialApiUrl,
  [Parameter(Mandatory = $true)][string]$CertificateThumbprint,
  [string]$TimestampUrl = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$uri = $null
if (-not [Uri]::TryCreate($CommercialApiUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne "https") {
  throw "CommercialApiUrl deve ser uma URL HTTPS absoluta."
}
if ($uri.Host -in @("localhost", "127.0.0.1") -or $uri.Host.EndsWith(".invalid")) {
  throw "A release de produção não aceita host local ou fictício."
}

$thumbprint = ($CertificateThumbprint -replace "\s", "").ToUpperInvariant()
$certificate = Get-ChildItem Cert:\CurrentUser\My,Cert:\LocalMachine\My -CodeSigningCert |
  Where-Object Thumbprint -eq $thumbprint |
  Select-Object -First 1
if (-not $certificate -or -not $certificate.HasPrivateKey -or $certificate.NotAfter -le (Get-Date)) {
  throw "Certificado Authenticode válido, não expirado e com chave privada não encontrado."
}

$temporaryConfig = Join-Path ([IO.Path]::GetTempPath()) "cnc-tauri-production-$([guid]::NewGuid().ToString('N')).json"
$override = [ordered]@{
  bundle = [ordered]@{
    windows = [ordered]@{
      certificateThumbprint = $thumbprint
      digestAlgorithm = "sha256"
      timestampUrl = $TimestampUrl
      tsp = $false
    }
  }
}

try {
  $override | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temporaryConfig -Encoding UTF8
  $env:CNC_COMMERCIAL_API_URL = $uri.AbsoluteUri.TrimEnd("/")
  Set-Location $root
  npm run tauri:build -- --config $temporaryConfig
  if ($LASTEXITCODE -ne 0) { throw "Build Tauri de produção falhou." }

  $version = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
  $artifacts = @(
    (Join-Path $root "src-tauri\target\release\caixasimples-bratec.exe"),
    (Get-ChildItem (Join-Path $root "src-tauri\target\release\bundle\nsis") -Filter "*$version*setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName,
    (Get-ChildItem (Join-Path $root "src-tauri\target\release\bundle\msi") -Filter "*$version*.msi" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  )
  foreach ($artifact in $artifacts) {
    if (-not $artifact -or -not (Test-Path -LiteralPath $artifact)) { throw "Artefato de produção ausente." }
    $signature = Get-AuthenticodeSignature -LiteralPath $artifact
    if ($signature.Status -ne "Valid") { throw "Assinatura Authenticode inválida em ${artifact}: $($signature.Status)" }
  }

  & (Join-Path $PSScriptRoot "build-release.ps1") -SkipBuild
  if ($LASTEXITCODE -ne 0) { throw "Empacotamento da release assinada falhou." }
  Write-Host "Release comercial assinada e verificada."
} finally {
  if (Test-Path -LiteralPath $temporaryConfig) { Remove-Item -LiteralPath $temporaryConfig -Force }
}
