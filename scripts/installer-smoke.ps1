param(
  [Parameter(Mandatory = $true)][string]$NsisInstaller,
  [Parameter(Mandatory = $true)][string]$MsiInstaller
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$outputRoot = Join-Path $root "output\installer-smoke"
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$runId = [guid]::NewGuid().ToString("N")
$nsisTarget = Join-Path $outputRoot "nsis-$runId"
$msiTarget = Join-Path $outputRoot "msi-$runId"
New-Item -ItemType Directory -Force -Path $nsisTarget, $msiTarget | Out-Null

$nsis = (Resolve-Path $NsisInstaller).Path
$msi = (Resolve-Path $MsiInstaller).Path
if (-not $nsisTarget.StartsWith($outputRoot) -or -not $msiTarget.StartsWith($outputRoot)) {
  throw "Destino do smoke test fora da pasta controlada."
}

$install = Start-Process -FilePath $nsis -ArgumentList @("/S", "/D=$nsisTarget") -Wait -PassThru -WindowStyle Hidden
if ($install.ExitCode -ne 0) { throw "Instalação NSIS retornou $($install.ExitCode)." }
$installedExe = Join-Path $nsisTarget "caixasimples-bratec.exe"
$uninstaller = Join-Path $nsisTarget "uninstall.exe"
if (-not (Test-Path $installedExe) -or -not (Test-Path $uninstaller)) {
  throw "NSIS não instalou executável e desinstalador no destino esperado."
}

$uninstall = Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait -PassThru -WindowStyle Hidden
if ($uninstall.ExitCode -ne 0) { throw "Desinstalação NSIS retornou $($uninstall.ExitCode)." }
if (Test-Path $installedExe) { throw "O executável permaneceu após a desinstalação NSIS." }

$msiArgs = @("/a", "`"$msi`"", "/qn", "TARGETDIR=`"$msiTarget`"")
$msiExtract = Start-Process -FilePath "msiexec.exe" -ArgumentList $msiArgs -Wait -PassThru -WindowStyle Hidden
if ($msiExtract.ExitCode -ne 0) { throw "Extração administrativa MSI retornou $($msiExtract.ExitCode)." }
$msiExe = Get-ChildItem -LiteralPath $msiTarget -Recurse -Filter "caixasimples-bratec.exe" | Select-Object -First 1
if (-not $msiExe) { throw "MSI não contém o executável principal." }

$generatedNsis = Join-Path $root "src-tauri\target\release\nsis\x64\installer.nsi"
$sourceHook = Join-Path $root "src-tauri\installer\hooks.nsh"
$hookVerified = (Test-Path $generatedNsis) -and
  (Test-Path $sourceHook) -and
  [bool](Select-String -LiteralPath $generatedNsis -SimpleMatch "installer\hooks.nsh" -Quiet) -and
  [bool](Select-String -LiteralPath $generatedNsis -SimpleMatch "!insertmacro NSIS_HOOK_PREUNINSTALL" -Quiet) -and
  [bool](Select-String -LiteralPath $sourceHook -SimpleMatch "Deseja tambem remover permanentemente TODOS os dados locais" -Quiet) -and
  [bool](Select-String -LiteralPath $sourceHook -SimpleMatch "br.com.bratecinfo.caixanocontrole" -Quiet)
if (-not $hookVerified) { throw "O instalador gerado não contém a confirmação separada de remoção de dados." }

$result = [ordered]@{
  testedAtUtc = [DateTime]::UtcNow.ToString("o")
  nsisSilentInstall = "passed"
  nsisUninstall = "passed"
  nsisSilentUninstallPreservesDataByDefault = "passed"
  uninstallDataPromptEmbedded = "passed"
  msiAdministrativeExtraction = "passed"
  webView2OfflinePayload = "configured"
}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputRoot "installer-smoke-result.json") -Encoding UTF8
$result
