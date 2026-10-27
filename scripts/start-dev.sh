#!/usr/bin/env bash
# RestoSync — One-shot dev launcher (macOS / Linux)
# Usage:  pnpm dev:all   (preferred)   |   bash scripts/start-dev.sh
#
# Boots: docker (postgres + redis) -> API server -> Tablet (Expo Web)
#        -> opens Tablet + Pickup TV in browser tabs.
# API and Tablet run in the background; logs go to .dev-logs/.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
mkdir -p .dev-logs

# Cross-platform "open URL in browser"
open_url() {
  if command -v open >/dev/null 2>&1; then open "$1"        # macOS
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1"  # Linux
  fi
}

echo ""
echo "================================================================"
echo " RestoSync Dev Launcher"
echo "================================================================"
echo " Repo : $REPO_ROOT"
echo ""

# ── 1) Docker (postgres + redis) ─────────────────────────────────────────────
echo "[1/5] docker compose up -d (postgres, redis)..."
if ! docker compose up -d; then
  echo "  ! docker compose failed. Is Docker Desktop running?" >&2
  exit 1
fi

echo "[1/5] waiting for postgres healthcheck..."
ready=false
for _ in $(seq 1 30); do
  state="$(docker inspect --format '{{.State.Health.Status}}' restosync-postgres 2>/dev/null || true)"
  if [ "$state" = "healthy" ]; then ready=true; break; fi
  sleep 1
done
if $ready; then echo "  ✓ postgres healthy"; else echo "  ! postgres not healthy in 30s — continuing anyway"; fi

# ── 2) API server (background) ───────────────────────────────────────────────
echo "[2/5] starting API server (logs: .dev-logs/api.log)..."
pnpm --filter @restosync/api dev > .dev-logs/api.log 2>&1 &
echo $! > .dev-logs/api.pid

echo "[2/5] waiting for API /health on :3000..."
apiReady=false
for _ in $(seq 1 30); do
  if curl -sf -o /dev/null --max-time 1 http://localhost:3000/health; then apiReady=true; break; fi
  sleep 1
done
if $apiReady; then echo "  ✓ API reachable"; else echo "  ! API /health not reachable yet — Tablet will retry"; fi

# ── 3) Tablet (Expo Web, background) ─────────────────────────────────────────
echo "[3/5] starting Tablet (Expo Web :8081, logs: .dev-logs/tablet.log)..."
pnpm --filter @restosync/tablet exec expo start --web --port 8081 > .dev-logs/tablet.log 2>&1 &
echo $! > .dev-logs/tablet.pid

# ── 4) Open Tablet browser tab ───────────────────────────────────────────────
echo "[4/5] waiting for Expo Web bundle on :8081..."
webReady=false
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null --max-time 1 http://localhost:8081; then webReady=true; break; fi
  sleep 1
done
if $webReady; then
  echo "  ✓ Expo Web ready — opening Tablet tab"
  open_url 'http://localhost:8081'
else
  echo "  ! Expo Web not ready in 60s. Open http://localhost:8081 manually."
fi

# ── 5) Open Pickup TV viewer (served by API on :3000) ────────────────────────
echo "[5/5] opening Pickup TV viewer..."
if $apiReady; then
  sleep 1
  open_url 'http://localhost:3000/tv-view?role=pickup&autoconnect=1'
  echo "  ✓ Pickup TV tab opened"
else
  echo "  ! API not reachable, skipping Pickup TV auto-open."
  echo "    Open manually: http://localhost:3000/tv-view?role=pickup&autoconnect=1"
fi

echo ""
echo "================================================================"
echo " All processes launched."
echo "   API        -> http://localhost:3000"
echo "   Tablet     -> http://localhost:8081"
echo "   Pickup TV  -> http://localhost:3000/tv-view?role=pickup&autoconnect=1"
echo "   Logs       -> .dev-logs/{api,tablet}.log"
echo ""
echo " To stop everything:  pnpm dev:stop"
echo "================================================================"
