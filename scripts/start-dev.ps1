# RestoSync — One-shot dev launcher (Windows / PowerShell)
# Usage:  pnpm dev:all       (preferred)
#         pwsh -File scripts/start-dev.ps1
#
# Boots: docker (postgres + redis) -> API server -> Tablet (Expo Web)
#        -> opens Tablet + Pickup TV in browser tabs.
# Each long-running process opens in its own PowerShell window so logs stay
# readable and Ctrl+C stops only that one process.

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " RestoSync Dev Launcher" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Repo : $RepoRoot"
Write-Host ""

# ── 1) Docker (postgres + redis) ────────────────────────────────────────────
Write-Host "[1/4] docker compose up -d (postgres, redis)..." -ForegroundColor Yellow
try {
    docker compose up -d | Out-Host
} catch {
    Write-Host "  ! docker compose failed. Is Docker Desktop running?" -ForegroundColor Red
    throw
}

# Wait for postgres healthcheck (up to 30s)
Write-Host "[1/4] waiting for postgres healthcheck..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    $state = (docker inspect --format '{{.State.Health.Status}}' restosync-postgres 2>$null)
    if ($state -eq 'healthy') { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    Write-Host "  ! postgres did not become healthy in 30s — continuing anyway" -ForegroundColor Red
} else {
    Write-Host "  ✓ postgres healthy" -ForegroundColor Green
}

# ── 2) API server (new window) ──────────────────────────────────────────────
Write-Host "[2/4] starting API server (new window)..." -ForegroundColor Yellow
$apiCmd = "Set-Location '$RepoRoot'; `$Host.UI.RawUI.WindowTitle = 'RestoSync · API :3000'; pnpm --filter @restosync/api dev"
Start-Process -FilePath 'powershell.exe' `
    -ArgumentList '-NoExit', '-NoProfile', '-Command', $apiCmd `
    -WorkingDirectory $RepoRoot

# Wait for API /health (up to 30s)
Write-Host "[2/4] waiting for API /health on :3000..." -ForegroundColor Yellow
$apiReady = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:3000/health' -UseBasicParsing -TimeoutSec 1
        if ($r.StatusCode -eq 200) { $apiReady = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
}
if ($apiReady) {
    Write-Host "  ✓ API reachable" -ForegroundColor Green
} else {
    Write-Host "  ! API /health not reachable yet — Tablet will retry on its own" -ForegroundColor Yellow
}

# ── 3) Tablet (Expo Web, new window) ────────────────────────────────────────
Write-Host "[3/4] starting Tablet (Expo Web, new window)..." -ForegroundColor Yellow
$tabCmd = "Set-Location '$RepoRoot'; `$Host.UI.RawUI.WindowTitle = 'RestoSync · Tablet Web :8081'; pnpm --filter @restosync/tablet exec expo start --web --port 8081"
Start-Process -FilePath 'powershell.exe' `
    -ArgumentList '-NoExit', '-NoProfile', '-Command', $tabCmd `
    -WorkingDirectory $RepoRoot

# ── 4) Open browser ─────────────────────────────────────────────────────────
Write-Host "[4/4] waiting for Expo Web bundle on :8081..." -ForegroundColor Yellow
$webReady = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:8081' -UseBasicParsing -TimeoutSec 1
        if ($r.StatusCode -eq 200) { $webReady = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
}
if ($webReady) {
    Write-Host "  ✓ Expo Web ready — opening Tablet tab" -ForegroundColor Green
    Start-Process 'http://localhost:8081'
} else {
    Write-Host "  ! Expo Web not ready in 60s. Open http://localhost:8081 manually once the bundle finishes." -ForegroundColor Yellow
}

# ── 5) Open Pickup TV viewer (served by API on :3000) ───────────────────────
# /tv-view is the browser TV viewer (apps/api/public/tv-view.html). It reads
# ?role= and ?autoconnect=1 to skip the setup form and connect via WebSocket.
Write-Host "[5/5] opening Pickup TV viewer (http://localhost:3000/tv-view?role=pickup)..." -ForegroundColor Yellow
if ($apiReady) {
    Start-Sleep -Seconds 1
    Start-Process 'http://localhost:3000/tv-view?role=pickup&autoconnect=1'
    Write-Host "  ✓ Pickup TV tab opened" -ForegroundColor Green
} else {
    Write-Host "  ! API was not reachable, skipping Pickup TV auto-open." -ForegroundColor Yellow
    Write-Host "    Open manually once API is up: http://localhost:3000/tv-view?role=pickup&autoconnect=1" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " All processes launched." -ForegroundColor Cyan
Write-Host "   API        -> http://localhost:3000  (window: RestoSync · API)"
Write-Host "   Tablet     -> http://localhost:8081  (window: RestoSync · Tablet Web)"
Write-Host "   Pickup TV  -> http://localhost:3000/tv-view?role=pickup&autoconnect=1"
Write-Host "   Engineer Mode: ON by default (DEFAULT_LICENSE ends with :dev)"
Write-Host ""
Write-Host " To stop everything:  pnpm dev:stop"
Write-Host "================================================================" -ForegroundColor Cyan
