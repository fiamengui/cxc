$ErrorActionPreference = "Stop"

$workspace = "C:\Workspace"
$output = "C:\SmokeOutput"
$version = (Get-Content (Join-Path $workspace "package.json") -Raw | ConvertFrom-Json).version
$release = Join-Path $workspace "dist\releases\$version"
$nsis = Join-Path $release "CaixaSimples-Bratec-$version-Setup.exe"
$msi = Join-Path $release "CaixaSimples-Bratec-$version-x64.msi"
$checksums = Join-Path $release "SHA256SUMS.txt"
$installRoot = "C:\Smoke\CaixaSimples"
$msiRoot = "C:\Smoke\Msi"

New-Item -ItemType Directory -Force -Path $output, $installRoot, $msiRoot | Out-Null

foreach ($path in @($nsis, $msi, $checksums)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Arquivo obrigatório ausente: $path" }
}

$expected = @{}
foreach ($line in Get-Content -LiteralPath $checksums) {
  if ($line -match "^([a-fA-F0-9]{64})\s{2}(.+)$") { $expected[$Matches[2]] = $Matches[1].ToUpperInvariant() }
}
foreach ($artifact in @($nsis, $msi)) {
  $name = Split-Path $artifact -Leaf
  $actual = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash
  if (-not $expected.ContainsKey($name) -or $expected[$name] -ne $actual) {
    throw "Hash inválido para $name."
  }
}

$install = Start-Process -FilePath $nsis -ArgumentList @("/S", "/D=$installRoot") -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "Instalação NSIS retornou $($install.ExitCode)." }

$app = Join-Path $installRoot "caixasimples-bratec.exe"
$uninstaller = Join-Path $installRoot "uninstall.exe"
$manual = Join-Path $installRoot "manual\Manual-do-Usuario-CaixaSimples-Bratec.pdf"
foreach ($path in @($app, $uninstaller, $manual)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Instalação incompleta: $path" }
}

$process = Start-Process -FilePath $app -PassThru
Start-Sleep -Seconds 20
$process.Refresh()
if ($process.HasExited) { throw "O aplicativo encerrou durante a inicialização limpa." }
Stop-Process -Id $process.Id -Force

$msiArgs = @("/a", "`"$msi`"", "/qn", "TARGETDIR=`"$msiRoot`"")
$msiExtract = Start-Process -FilePath "msiexec.exe" -ArgumentList $msiArgs -Wait -PassThru
if ($msiExtract.ExitCode -ne 0) { throw "Extração MSI retornou $($msiExtract.ExitCode)." }
if (-not (Get-ChildItem -LiteralPath $msiRoot -Recurse -Filter "caixasimples-bratec.exe" | Select-Object -First 1)) {
  throw "MSI não contém o executável principal."
}

$uninstall = Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait -PassThru
if ($uninstall.ExitCode -ne 0) { throw "Desinstalação NSIS retornou $($uninstall.ExitCode)." }

[ordered]@{
  testedAtUtc = [DateTime]::UtcNow.ToString("o")
  windows = (Get-CimInstance Win32_OperatingSystem).Caption
  version = $version
  hashes = "passed"
  nsisInstall = "passed"
  cleanLaunch20Seconds = "passed"
  bundledManual = "passed"
  msiExtraction = "passed"
  nsisUninstall = "passed"
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output "windows-sandbox-smoke-result.json") -Encoding UTF8

Stop-Computer -Force
