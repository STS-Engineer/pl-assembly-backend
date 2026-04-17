$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$port = 3000
$envFilePath = Join-Path $projectRoot '.env'

if ($env:PORT -match '^\d+$') {
  $port = [int]$env:PORT
} elseif (Test-Path $envFilePath) {
  $portLine = Get-Content $envFilePath | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1

  if ($portLine) {
    $portValue = ($portLine -split '=', 2)[1].Trim()

    if ($portValue -match '^\d+$') {
      $port = [int]$portValue
    }
  }
}

$connections = netstat -ano | Select-String ":$port"
$processIds = $connections |
  ForEach-Object { ($_ -split '\s+')[-1] } |
  Where-Object { $_ -match '^[0-9]+$' } |
  Select-Object -Unique

if ($processIds) {
  $backendHealthOk = $false

  try {
    $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/api/health" -TimeoutSec 2
    $backendHealthOk = $response.StatusCode -eq 200 -and $response.Content -match '"status"\s*:\s*"ok"'
  } catch {
    $backendHealthOk = $false
  }

  if (-not $backendHealthOk) {
    Write-Error "Port $port is already used by another process. Stop it or change PORT in .env."
    exit 1
  }

  foreach ($processId in $processIds) {
    Stop-Process -Id ([int]$processId) -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped backend process on port $port (PID $processId)."
  }

  Start-Sleep -Seconds 1
}

node index.js
