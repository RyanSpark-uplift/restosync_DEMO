# RestoSync — Stop all dev processes
# Usage:  pnpm dev:stop
#         pwsh -File scripts/stop-dev.ps1

$ErrorActionPreference = 'Continue'

Write-Host "Stopping RestoSync dev stack..." -ForegroundColor Yellow

# 1) Kill node/expo processes by port (3000 = API, 8081 = Tablet Web/Metro)
foreach ($port in 3000, 8081) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        try {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
            Write-Host "  ✓ killed PID $($c.OwningProcess) on :$port" -ForegroundColor Green
        } catch { }
    }
}

# 2) Docker containers
Write-Host "Stopping docker compose..." -ForegroundColor Yellow
docker compose stop | Out-Host

Write-Host "Done." -ForegroundColor Green
