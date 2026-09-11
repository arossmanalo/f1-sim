$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

if (-not (Test-Path -LiteralPath 'node_modules')) {
  Write-Host 'Installing F1 SIM dependencies...'
  pnpm install
}

if (-not (Test-Path -LiteralPath 'apps/web/dist')) {
  Write-Host 'Building F1 SIM...'
  pnpm build
}

$port = 4173
if (Test-Path -LiteralPath '.env') {
  $portSetting = Get-Content -LiteralPath '.env' | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1
  if ($portSetting -and $portSetting -match '=\s*(\d+)') { $port = [int]$Matches[1] }
}
$appUrl = "http://localhost:$port"

$serverProcess = Start-Process -FilePath 'node.exe' -ArgumentList @('apps/server/dist/index.js') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
  try {
    Invoke-RestMethod -Uri "$appUrl/api/health" -TimeoutSec 1 | Out-Null
    $ready = $true
    break
  } catch {
    Start-Sleep -Milliseconds 250
  }
}

if (-not $ready) {
  Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
  throw "F1 SIM service did not become ready on $appUrl."
}

try {
  Start-Process -FilePath 'explorer.exe' -ArgumentList @($appUrl) -ErrorAction Stop | Out-Null
} catch {
  Write-Warning "The browser could not be opened automatically. Open $appUrl manually."
}

Write-Host "F1 SIM is running at $appUrl (server PID $($serverProcess.Id))."
Write-Host 'Close this window to stop the local service.'
Wait-Process -Id $serverProcess.Id
