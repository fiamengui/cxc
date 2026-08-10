param([Parameter(Mandatory = $true)][string]$CommercialApiUrl)

$ErrorActionPreference = "Stop"
$required = @(
  "DATABASE_URL",
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "MERCADO_PAGO_MONTHLY_PLAN_ID",
  "MERCADO_PAGO_ANNUAL_PLAN_ID",
  "ENTITLEMENT_PRIVATE_KEY_PATH",
  "ENTITLEMENT_KEY_ID"
)
$missing = $required | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }
if ($missing) { throw "Variáveis ausentes: $($missing -join ', ')" }
$uri = [Uri]$CommercialApiUrl
if ($uri.Scheme -ne "https" -or $uri.Host -in @("localhost","127.0.0.1") -or $uri.Host.EndsWith(".invalid")) { throw "URL comercial de produção inválida." }
$health = Invoke-RestMethod -Uri "$($uri.AbsoluteUri.TrimEnd('/'))/health" -TimeoutSec 15
if ($health.status -ne "ok") { throw "Healthcheck comercial não retornou status ok." }
Write-Host "Configuração obrigatória presente e API comercial saudável."
