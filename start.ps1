# LoanLoop launcher (Windows PowerShell 5.1). Usage: .\start.ps1 [-Seed]
param([switch]$Seed)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$ollama = 'http://127.0.0.1:11434'
$model = 'qwen3:8b'

# Docker
docker info *> $null
if ($LASTEXITCODE -ne 0) { Write-Host 'Docker is not running. Start Docker Desktop and run this again.' -ForegroundColor Red; exit 1 }
Push-Location $root
docker compose up -d
$rc = $LASTEXITCODE
Pop-Location
if ($rc -ne 0) { Write-Host 'docker compose up failed.' -ForegroundColor Red; exit 1 }

# Ollama + model
$tags = $null
try { $tags = Invoke-RestMethod "$ollama/api/tags" -TimeoutSec 5 } catch {}
if (-not $tags) {
  Write-Host 'Ollama is not running; starting it in its own window...'
  $env:OLLAMA_MODELS = 'D:\Work\Hackathons\gnani\ollama-models'
  $env:OLLAMA_KEEP_ALIVE = '-1'
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$Host.UI.RawUI.WindowTitle='loanloop-ollama'; ollama serve"
  for ($i = 0; $i -lt 15 -and -not $tags; $i++) {
    Start-Sleep 2
    try { $tags = Invoke-RestMethod "$ollama/api/tags" -TimeoutSec 2 } catch {}
  }
  if (-not $tags) { Write-Host "Ollama did not come up at $ollama within 30 s. Check its window." -ForegroundColor Red; exit 1 }
}
if (-not ($tags.models | Where-Object { $_.name -eq $model })) {
  Write-Host "Model $model is not pulled. Run:" -ForegroundColor Red
  Write-Host "  `$env:OLLAMA_MODELS='D:\Work\Hackathons\gnani\ollama-models'; ollama pull $model"
  Write-Host '(restart Ollama after setting OLLAMA_MODELS so the server uses the same folder)'
  exit 1
}

if ($Seed) {
  Push-Location (Join-Path $root 'gateway')
  uv run python ../tools/seed_data.py
  $rc = $LASTEXITCODE
  Pop-Location
  if ($rc -ne 0) { Write-Host 'Seeding failed.' -ForegroundColor Red; exit 1 }
}

# Start services in their own windows; record PIDs for stop.ps1
$svc = @(
  @{ name = 'gateway'; dir = 'gateway'; cmd = 'uv run uvicorn app.main:app --host 127.0.0.1 --port 8000'; url = 'http://127.0.0.1:8000/health' },
  @{ name = 'voice';   dir = 'gateway'; cmd = 'uv run uvicorn voice.app:app --host 127.0.0.1 --port 8100 --app-dir ..'; url = 'http://127.0.0.1:8100/health' },
  @{ name = 'web';     dir = 'web';     cmd = 'npm run dev'; url = 'http://127.0.0.1:3000' }
)
$pids = @{}
foreach ($s in $svc) {
  $wd = Join-Path $root $s.dir
  $p = Start-Process powershell -WorkingDirectory $wd -PassThru -ArgumentList '-NoExit', '-Command', "`$Host.UI.RawUI.WindowTitle='loanloop-$($s.name)'; $($s.cmd)"
  $pids[$s.name] = $p.Id
}
New-Item -ItemType Directory -Force (Join-Path $root '.run') | Out-Null
$pids | ConvertTo-Json | Set-Content -Encoding ascii (Join-Path $root '.run\pids.json')

# Wait for health (first Next.js compile can be slow)
foreach ($s in $svc) {
  $ok = $false
  for ($i = 0; $i -lt 90 -and -not $ok; $i++) {
    try { Invoke-WebRequest $s.url -UseBasicParsing -TimeoutSec 3 | Out-Null; $ok = $true } catch { Start-Sleep 2 }
  }
  if ($ok) { Write-Host "$($s.name) up: $($s.url)" } else { Write-Host "$($s.name) did not become healthy; check its window." -ForegroundColor Red }
}

Write-Host ''
Write-Host 'Open:'
foreach ($p in 'call/priya', 'phone/priya', 'ops', 'metrics') { Write-Host "  http://127.0.0.1:3000/$p" }
Write-Host 'Stop everything with .\stop.ps1'
