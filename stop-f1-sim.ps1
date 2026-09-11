$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

$port = 4173
if (Test-Path -LiteralPath '.env') {
  $portSetting = Get-Content -LiteralPath '.env' | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1
  if ($portSetting -and $portSetting -match '=\s*(\d+)') { $port = [int]$Matches[1] }
}

$healthUrl = "http://127.0.0.1:$port/api/health"
$health = $null
try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
} catch {
  Write-Host 'F1 SIM is not running.'
  exit 0
}

if ($health.service -ne 'f1-sim-local') {
  throw "Port $port is being used by another service. Nothing was stopped."
}

$connections = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
$processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
if ($processIds.Count -eq 0) {
  Write-Host 'F1 SIM is not running.'
  exit 0
}

foreach ($processId in $processIds) {
  Stop-Process -Id $processId -Force
  Write-Host "F1 SIM stopped (PID $processId)."
}
