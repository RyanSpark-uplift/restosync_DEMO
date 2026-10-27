#!/usr/bin/env bash
# RestoSync — Stop all dev processes (macOS / Linux)
# Usage:  pnpm dev:stop   |   bash scripts/stop-dev.sh
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Stopping RestoSync dev stack..."

# 1) Kill processes listening on dev ports (3000 = API, 8081 = Tablet Web/Metro)
for port in 3000 8081; do
  pids="$(lsof -ti tcp:"$port" -s tcp:LISTEN 2>/dev/null || true)"
  for pid in $pids; do
    if kill "$pid" 2>/dev/null; then
      echo "  ✓ killed PID $pid on :$port"
    fi
  done
done

# 2) Clean up recorded pidfiles
rm -f .dev-logs/api.pid .dev-logs/tablet.pid 2>/dev/null || true

# 3) Docker containers
echo "Stopping docker compose..."
docker compose stop

echo "Done."
