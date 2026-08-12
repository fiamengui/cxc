param(
  [string]$CommercialApiUrl = "https://cnc-commercial-bratecinfo-sandbox.onrender.com",
  [string]$ReleaseDirectory
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($ReleaseDirectory)) {
  $version = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
  $ReleaseDirectory = Join-Path $root "dist\releases\$version"
}

$uri = $null
if (-not [Uri]::TryCreate($CommercialApiUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne "https") {
  throw "CommercialApiUrl deve ser uma URL HTTPS absoluta."
}
if ($uri.Host -in @("localhost", "127.0.0.1") -or $uri.Host.EndsWith(".invalid")) {
  throw "A auditoria não aceita host local ou fictício."
}

$baseUrl = $uri.AbsoluteUri.TrimEnd("/")
$health = Invoke-RestMethod -Uri "$baseUrl/health" -TimeoutSec 90
$database = Invoke-RestMethod -Uri "$baseUrl/health/database" -TimeoutSec 90
if ($health.status -ne "ok" -or $database.status -ne "ok") {
  throw "API comercial ou banco de dados não está saudável."
}

$releasePath = (Resolve-Path -LiteralPath $ReleaseDirectory).Path
$checksumPath = Join-Path $releasePath "SHA256SUMS.txt"
if (-not (Test-Path -LiteralPath $checksumPath)) { throw "SHA256SUMS.txt ausente." }

$expected = @{}
foreach ($line in Get-Content -LiteralPath $checksumPath) {
  if ($line -match "^([a-fA-F0-9]{64})\s{2}(.+)$") { $expected[$Matches[2]] = $Matches[1].ToUpperInvariant() }
}

$installers = Get-ChildItem -LiteralPath $releasePath -File |
  Where-Object { $_.Name -match "(?i)(Setup\.exe|\.msi)$" }
if ($installers.Count -lt 2) { throw "Instaladores NSIS/MSI não encontrados." }

$artifacts = foreach ($installer in $installers) {
  $actualHash = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash
  $hashMatches = $expected.ContainsKey($installer.Name) -and $expected[$installer.Name] -eq $actualHash
  if (-not $hashMatches) { throw "Hash divergente para $($installer.Name)." }
  $signature = Get-AuthenticodeSignature -LiteralPath $installer.FullName
  [ordered]@{
    file = $installer.Name
    sha256Verified = $true
    authenticode = [string]$signature.Status
  }
}

[ordered]@{
  checkedAtUtc = [DateTime]::UtcNow.ToString("o")
  apiUrl = $baseUrl
  api = $health.status
  database = $database.status
  artifacts = $artifacts
  readyForControlledBeta = $true
  readyForPublicSale = -not ($artifacts.authenticode -contains "NotSigned")
} | ConvertTo-Json -Depth 5
