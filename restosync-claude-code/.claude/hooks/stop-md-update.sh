#!/bin/bash
# .claude/hooks/stop-md-update.sh
# Runs after stop-run-tests.sh passes. Appends 1-line entry to active module's
# CLAUDE-Mxx.md "## Current Status" section.
# Identifies active module from .claude/md-stale.jsonl (most recent code edit).

PROJ="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG="$PROJ/.claude/md-stale.jsonl"
TOKEN_LOG="$PROJ/.claude/token-log.jsonl"

# Only run if previous tests passed (stop-run-tests.sh exits 0)
# Caller arrangement in settings.json runs stop-run-tests first; if it returns 2,
# this script doesn't get to here.

# Determine active module
ACTIVE_MODULE=""
if [ -f "$LOG" ]; then
  LAST_CODE=$(tail -20 "$LOG" 2>/dev/null | jq -r 'select(.event=="md_stale") | .code' 2>/dev/null | tail -1)
  case "$LAST_CODE" in
    */apps/api/*)                          ACTIVE_MODULE="M05" ;;
    */apps/tablet/*)                       ACTIVE_MODULE="M04" ;;
    */apps/tv/src/screens/MenuBoardScreen*) ACTIVE_MODULE="M01" ;;
    */apps/tv/src/screens/PickupScreen*)    ACTIVE_MODULE="M02" ;;
    */apps/tv/src/screens/EventScreen*)     ACTIVE_MODULE="M03" ;;
    */packages/shared/*)                   ACTIVE_MODULE="M05" ;;
  esac
fi

# Fallback: scan token-log for recent CLAUDE-Mxx.md reads
if [ -z "$ACTIVE_MODULE" ] && [ -f "$TOKEN_LOG" ]; then
  ACTIVE_MODULE=$(tail -50 "$TOKEN_LOG" 2>/dev/null | \
    grep -oE 'CLAUDE-M[0-9]{2}' | tail -1 | sed 's/CLAUDE-//')
fi

[ -z "$ACTIVE_MODULE" ] && exit 0

MD="$PROJ/modules/CLAUDE-${ACTIVE_MODULE}.md"
[ -f "$MD" ] || exit 0

# Detect step from recent context (best-effort; main is usually clearer)
STEP_INFO=$(tail -50 "$TOKEN_LOG" 2>/dev/null | \
  grep -oE 'Step [0-9]+/[0-9]+' | tail -1)
[ -z "$STEP_INFO" ] && STEP_INFO="—"

# Detect changed workspaces from git
cd "$PROJ" 2>/dev/null
CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null | head -3 | tr '\n' ',' | sed 's/,$//')
[ -z "$CHANGED_FILES" ] && CHANGED_FILES="(no git changes)"

TS=$(date -u +"%Y-%m-%d %H:%M")
ENTRY="- [$TS] $STEP_INFO done · $CHANGED_FILES"

# Ensure "## Current Status" section exists with marker
if ! grep -q "## Current Status" "$MD"; then
  printf "\n## Current Status\n<!-- RS-MD-AUTO:current-status -->\n" >> "$MD"
fi

# Idempotency: skip if last line under section is identical
LAST_STATUS_LINE=$(awk '/## Current Status/{flag=1; next} flag && /^- /{last=$0} END{print last}' "$MD")
if [ "$LAST_STATUS_LINE" = "$ENTRY" ]; then
  exit 0
fi

# Append after the section marker
awk -v entry="$ENTRY" '
  /<!-- RS-MD-AUTO:current-status -->/ {
    print
    in_section=1
    next
  }
  in_section && /^## / {
    # End of section reached without writing — write before next section
    print entry
    in_section=0
  }
  { print }
  END {
    if (in_section) print entry
  }
' "$MD" > "$MD.tmp" && mv "$MD.tmp" "$MD"

# Log the auto-update for monitor
TS_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
jq -nc --arg ts "$TS_ISO" --arg md "$(basename "$MD")" --arg module "$ACTIVE_MODULE" \
  '{ts:$ts, event:"md_auto_update", file:$md, module:$module, kind:"current_status"}' \
  >> "$TOKEN_LOG" 2>/dev/null || true

# Brief stderr report so user sees in terminal
echo "📝 ${ACTIVE_MODULE}: Current Status updated" >&2

exit 0
