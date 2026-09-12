$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

function Find-CommandPath([string[]]$names) {
  foreach ($name in $names) {
    $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
  }
  return $null
}

$packageManager = Find-CommandPath @('pnpm.cmd', 'pnpm.exe', 'pnpm.ps1', 'pnpm')
$packageManagerPrefix = @()
if (-not $packageManager) {
  $nodePath = Find-CommandPath @('node.exe', 'node')
  $corepackCandidates = @()
  if ($nodePath) { $corepackCandidates += Join-Path (Split-Path -Parent $nodePath) 'corepack.cmd' }
  if ($env:ProgramFiles) { $corepackCandidates += Join-Path $env:ProgramFiles 'nodejs\corepack.cmd' }
  if ($env:LOCALAPPDATA) { $corepackCandidates += Join-Path $env:LOCALAPPDATA 'Programs\nodejs\corepack.cmd' }
  $packageManager = $corepackCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($packageManager) {
    # Keep Corepack's download/cache out of protected user locations.
    $corepackCache = Join-Path ([IO.Path]::GetTempPath()) 'f1-sim-corepack'
    $env:COREPACK_HOME = $corepackCache
    $packageManagerPrefix = @('pnpm')
  }
}
if (-not $packageManager) {
  $packageManager = Find-CommandPath @('npm.cmd', 'npm.exe', 'npm.ps1', 'npm')
  if ($packageManager) { $packageManagerPrefix = @('exec', '--yes', 'pnpm@11.19.0', '--') }
}
if (-not $packageManager) {
  throw 'F1 SIM requires Node.js and pnpm. Install Node.js 24+ (which includes Corepack), then run this launcher again.'
}

function Invoke-PackageManager([string[]]$arguments) {
  & $script:packageManager @script:packageManagerPrefix @arguments
  if ($LASTEXITCODE -ne 0) { throw "Package manager command failed with exit code $LASTEXITCODE." }
}

if (-not (Test-Path -LiteralPath 'node_modules')) {
  Write-Host 'Installing F1 SIM dependencies...'
  Invoke-PackageManager @('install')
}

Write-Host 'Building F1 SIM...'
Invoke-PackageManager @('build')

$port = 4173
if (Test-Path -LiteralPath '.env') {
  $portSetting = Get-Content -LiteralPath '.env' | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1
  if ($portSetting -and $portSetting -match '=\s*(\d+)') { $port = [int]$Matches[1] }
}
$appUrl = "http://localhost:$port"
$healthUrl = "http://127.0.0.1:$port/api/health"

# Reuse a healthy service if the previous launcher window was closed while
# its child process remained alive. This also makes repeated double-clicks safe.
try {
  $existing = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
  if ($existing.ok) {
    try {
      Start-Process -FilePath 'explorer.exe' -ArgumentList @($appUrl) -ErrorAction Stop | Out-Null
    } catch {
      Write-Warning "The browser could not be opened automatically. Open $appUrl manually."
    }
    Write-Host "F1 SIM is already running at $appUrl. Reusing the existing service."
    exit 0
  }
} catch {
  # No healthy service is running; start one below.
}

$serverProcess = Start-Process -FilePath 'node.exe' -ArgumentList @('apps/server/dist/index.js') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
$ready = $false
for ($attempt = 0; $attempt -lt 120; $attempt += 1) {
  try {
    Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2 | Out-Null
    $ready = $true
    break
  } catch {
    Start-Sleep -Milliseconds 250
  }
}

if (-not $ready) {
  Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
  throw "F1 SIM service did not become ready on $appUrl. Check that Node.js is installed and that port $port is available."
}

try {
  Start-Process -FilePath 'explorer.exe' -ArgumentList @($appUrl) -ErrorAction Stop | Out-Null
} catch {
  Write-Warning "The browser could not be opened automatically. Open $appUrl manually."
}

Write-Host "F1 SIM is running at $appUrl (server PID $($serverProcess.Id))."
Write-Host 'Close this window to stop the local service.'
Wait-Process -Id $serverProcess.Id
