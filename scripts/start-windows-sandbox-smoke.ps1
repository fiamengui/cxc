$ErrorActionPreference = "Stop"

$sandbox = Get-Command WindowsSandbox.exe -ErrorAction SilentlyContinue
if (-not $sandbox) {
  throw "Windows Sandbox não está habilitado. Em um PowerShell como Administrador, execute: Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All"
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = Join-Path $root "output\windows-sandbox-smoke"
New-Item -ItemType Directory -Force -Path $output | Out-Null
$mappedOutput = Join-Path ([IO.Path]::GetTempPath()) "caixasimples-bratec-sandbox-smoke-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force -Path $mappedOutput | Out-Null

$escapedRoot = [Security.SecurityElement]::Escape($root)
$escapedOutput = [Security.SecurityElement]::Escape($mappedOutput)
$configuration = @"
<Configuration>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$escapedRoot</HostFolder>
      <SandboxFolder>C:\Workspace</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$escapedOutput</HostFolder>
      <SandboxFolder>C:\SmokeOutput</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <Networking>Enable</Networking>
  <ClipboardRedirection>Disable</ClipboardRedirection>
  <PrinterRedirection>Disable</PrinterRedirection>
  <LogonCommand>
    <Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Workspace\scripts\windows-sandbox-smoke.ps1</Command>
  </LogonCommand>
</Configuration>
"@

$configPath = Join-Path $output "caixasimples-clean-smoke.wsb"
$configuration | Set-Content -LiteralPath $configPath -Encoding UTF8
$sandboxProcess = Start-Process -FilePath $sandbox.Source -ArgumentList "`"$configPath`"" -PassThru
Write-Host "Windows Sandbox iniciado. Aguardando o smoke test isolado."
$mappedResult = Join-Path $mappedOutput "windows-sandbox-smoke-result.json"
$deadline = (Get-Date).AddMinutes(10)
$graceDeadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline -and -not (Test-Path -LiteralPath $mappedResult)) {
  $running = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -in @("WindowsSandbox", "WindowsSandboxRemoteSession", "WindowsSandboxServer", "vmmemWindowsSandbox")
  }
  if (-not $running -and $sandboxProcess.HasExited -and (Get-Date) -ge $graceDeadline) { break }
  Start-Sleep -Seconds 2
}

if (-not (Test-Path -LiteralPath $mappedResult)) {
  $exitCode = if ($sandboxProcess.HasExited) { $sandboxProcess.ExitCode } else { "ainda em execução" }
  throw "O Windows Sandbox encerrou sem gerar resultado (launcher: $exitCode). Consulte a pasta temporária $mappedOutput."
}
Get-ChildItem -LiteralPath $mappedOutput -File | Copy-Item -Destination $output -Force
$resultPath = Join-Path $output "windows-sandbox-smoke-result.json"
$result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
if ($result.outcome -ne "passed") { throw "Smoke test isolado falhou: $($result.error)" }
Write-Host "Resultado copiado para $resultPath."
