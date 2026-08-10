param(
  [Parameter(Mandatory = $true)][string]$IdentityName,
  [Parameter(Mandatory = $true)][string]$Publisher,
  [switch]$ValidationOnly
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$package = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$version = [string]$package.version
if ($IdentityName -notmatch '^[A-Za-z0-9.-]{3,50}$') { throw "IdentityName inválido; use exatamente o valor reservado no Partner Center." }
if ($Publisher -notmatch '^CN=.+') { throw "Publisher deve ser o valor exato fornecido pelo Partner Center, iniciado por CN=." }
$match = [regex]::Match($version, '^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$')
if (-not $match.Success) { throw "Versão SemVer não pode ser convertida para MSIX." }
$revision = if ($match.Groups[4].Success) { [int]$match.Groups[4].Value } else { 0 }
$msixVersion = "$($match.Groups[1].Value).$($match.Groups[2].Value).$($match.Groups[3].Value).$revision"

$exe = Join-Path $root "src-tauri\target\release\caixasimples-bratec.exe"
if (-not (Test-Path -LiteralPath $exe)) { throw "Compile o Tauri antes de gerar o MSIX." }
$makeAppx = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter MakeAppx.exe -ErrorAction SilentlyContinue | Where-Object FullName -Match '\\x64\\MakeAppx.exe$' | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $makeAppx) { throw "MakeAppx.exe x64 não encontrado. Instale o Windows SDK." }

$stageRoot = Join-Path $root "output\msix-stage"
$stage = Join-Path $stageRoot ([guid]::NewGuid().ToString("N"))
$assets = Join-Path $stage "Assets"
New-Item -ItemType Directory -Force -Path $assets | Out-Null
try {
  Copy-Item -LiteralPath $exe -Destination $stage
  Copy-Item -LiteralPath (Join-Path $root "src-tauri\resources\manual\Manual-do-Usuario-CaixaSimples-Bratec.pdf") -Destination $stage
  foreach ($name in @("StoreLogo.png","Square44x44Logo.png","Square150x150Logo.png","Square310x310Logo.png")) { Copy-Item -LiteralPath (Join-Path $root "src-tauri\icons\$name") -Destination $assets }
  foreach ($name in @("Wide310x150Logo.png","SplashScreen.png")) { Copy-Item -LiteralPath (Join-Path $root "store-assets\$name") -Destination $assets }
  $manifest = Get-Content (Join-Path $root "msix\AppxManifest.template.xml") -Raw
  $manifest = $manifest.Replace("__IDENTITY_NAME__",[Security.SecurityElement]::Escape($IdentityName)).Replace("__PUBLISHER__",[Security.SecurityElement]::Escape($Publisher)).Replace("__VERSION__",$msixVersion)
  $manifest | Set-Content -LiteralPath (Join-Path $stage "AppxManifest.xml") -Encoding UTF8
  [xml](Get-Content (Join-Path $stage "AppxManifest.xml") -Raw) | Out-Null
  $release = if ($ValidationOnly) { Join-Path $root "output\msix-validation" } else { Join-Path $root "dist\releases\$version" }
  New-Item -ItemType Directory -Force -Path $release | Out-Null
  $suffix = if ($ValidationOnly) { "-validation-only" } else { "" }
  $output = Join-Path $release "CaixaSimples-Bratec-$version-x64$suffix.msix"
  & $makeAppx.FullName pack /d $stage /p $output /o
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output)) { throw "MakeAppx não gerou o pacote." }
  if ($ValidationOnly) { Write-Host "MSIX técnico de validação gerado em $output; não distribuir." } else { Write-Host "MSIX não assinado gerado em $output. O Partner Center fará a assinatura da distribuição Store." }
} finally {
  $resolvedRoot = [IO.Path]::GetFullPath($stageRoot)
  $resolvedStage = [IO.Path]::GetFullPath($stage)
  if ($resolvedStage.StartsWith($resolvedRoot,[StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
