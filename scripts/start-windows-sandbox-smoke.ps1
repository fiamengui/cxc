$ErrorActionPreference = "Stop"

$sandbox = Get-Command WindowsSandbox.exe -ErrorAction SilentlyContinue
if (-not $sandbox) {
  throw "Windows Sandbox não está habilitado. Em um PowerShell como Administrador, execute: Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All"
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$output = Join-Path $root "output\windows-sandbox-smoke"
New-Item -ItemType Directory -Force -Path $output | Out-Null

$escapedRoot = [Security.SecurityElement]::Escape($root)
$escapedOutput = [Security.SecurityElement]::Escape($output)
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
Start-Process -FilePath $sandbox.Source -ArgumentList "`"$configPath`""
Write-Host "Windows Sandbox iniciado. O resultado será salvo em $output."
