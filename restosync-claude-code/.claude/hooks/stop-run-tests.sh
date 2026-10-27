#!/bin/bash
# .claude/hooks/stop-run-tests.sh
# Fires when Claude wants to stop. Runs tests for changed workspaces.
# If tests fail → exit 2 to force Claude to keep fixing (auto-debug loop).
# Bypass: touch .claude/.skip-stop-tests to skip once.

PROJ="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJ"

# Manual skip mechanism
if [ -f ".claude/.skip-stop-tests" ]; then
  rm -f ".claude/.skip-stop-tests"
  echo "ℹ️  Stop hook skipped (one-time)" >&2
  exit 0
fi

# Identify changed workspaces from git
if [ ! -d ".git" ]; then
  exit 0  # No git → can't determine scope, skip
fi

CHANGED=$(git diff --name-only HEAD 2>/dev/null; git diff --cached --name-only 2>/dev/null)
WORKSPACES=()

if echo "$CHANGED" | grep -q "^apps/api/";        then WORKSPACES+=("api"); fi
if echo "$CHANGED" | grep -q "^apps/tablet/";     then WORKSPACES+=("tablet"); fi
if echo "$CHANGED" | grep -q "^apps/tv/";         then WORKSPACES+=("tv"); fi
if echo "$CHANGED" | grep -q "^apps/web-admin/";  then WORKSPACES+=("web-admin"); fi
if echo "$CHANGED" | grep -q "^packages/shared/"; then WORKSPACES+=("@restosync/shared"); fi

if [ ${#WORKSPACES[@]} -eq 0 ]; then
  echo "ℹ️  No workspace changes — Stop hook OK" >&2
  exit 0
fi

echo "🧪 Running tests for changed workspaces: ${WORKSPACES[*]}" >&2

FAILED=()
for ws in "${WORKSPACES[@]}"; do
  echo "  → pnpm --filter $ws test" >&2
  if ! pnpm --filter "$ws" test --run 2>&1 | tail -50; then
    FAILED+=("$ws")
  fi
done

if [ ${#FAILED[@]} -gt 0 ]; then
  cat <<EOF >&2

🛑 Tests failed in: ${FAILED[*]}
Auto-debug loop activated. Fix the failures above and the Stop hook will re-run.
To skip this hook once, run: touch .claude/.skip-stop-tests

If you believe these are pre-existing failures unrelated to your changes,
add them to ANTI-Mxx.md so they're tracked.
EOF
  exit 2  # Forces Claude to continue working
fi

# All tests passed → completion notification
echo "" >&2
echo "✅ All tests passed across ${WORKSPACES[*]}" >&2

# Optional: Slack/Discord webhook notification
if [ -n "$RS_NOTIFICATION_WEBHOOK" ]; then
  curl -s -X POST "$RS_NOTIFICATION_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"✅ RestoSync Claude Code session complete — tests passed (${WORKSPACES[*]})\"}" \
    >/dev/null 2>&1 &
fi

# Desktop notification (macOS)
if command -v osascript >/dev/null 2>&1; then
  osascript -e "display notification \"All tests passed\" with title \"RestoSync Claude Code\"" 2>/dev/null || true
fi
# Linux notify-send
if command -v notify-send >/dev/null 2>&1; then
  notify-send "RestoSync Claude Code" "All tests passed" 2>/dev/null || true
fi

exit 0
