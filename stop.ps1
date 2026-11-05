# Stops the windows/process trees started by start.ps1 (PIDs in .run\pids.json). Docker is left running.
$f = Join-Path $PSScriptRoot '.run\pids.json'
if (-not (Test-Path $f)) { Write-Host 'No .run\pids.json; nothing to stop.'; exit 0 }
$pids = Get-Content $f -Raw | ConvertFrom-Json
foreach ($n in $pids.PSObject.Properties) {
  taskkill /PID $n.Value /T /F *> $null
  Write-Host "stopped $($n.Name) (pid $($n.Value))"
}
Remove-Item $f
Write-Host 'Docker (Postgres/Redis) still running; stop with: docker compose stop'
