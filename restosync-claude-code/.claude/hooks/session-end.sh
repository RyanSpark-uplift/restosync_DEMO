#!/bin/bash
# .claude/hooks/session-end.sh
# Session summary — token log analysis + ANTI-pattern reminder

PROJ="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG="$PROJ/.claude/token-log.jsonl"

cat <<EOF >&2

================================================================
📊 RestoSync Session Summary
================================================================
EOF

if [ -f "$LOG" ]; then
  COUNT=$(wc -l < "$LOG")
  echo "  Tool calls this session: $COUNT" >&2

  # Top 5 tools used
  echo "  Top tools:" >&2
  jq -r '.tool' "$LOG" 2>/dev/null | sort | uniq -c | sort -rn | head -5 \
    | awk '{printf "    %-20s %s calls\n", $2, $1}' >&2 || true
fi

# Check for unrecorded errors (rough heuristic — git diff has changes but no ANTI-Mxx update)
if [ -d "$PROJ/.git" ]; then
  cd "$PROJ"
  CHANGED_CODE=$(git diff --name-only HEAD 2>/dev/null | grep -E "\.(ts|tsx|js|jsx)$" | wc -l)
  CHANGED_ANTI=$(git diff --name-only HEAD 2>/dev/null | grep -E "ANTI-M[0-9]+\.md" | wc -l)

  if [ "$CHANGED_CODE" -gt 5 ] && [ "$CHANGED_ANTI" -eq 0 ]; then
    echo "  ⚠️  $CHANGED_CODE code files changed but no ANTI-Mxx.md updated" >&2
    echo "     If you encountered any errors, record them per AG-011" >&2
  fi
fi

echo "================================================================" >&2

# Reset budget warning flag
rm -f "$PROJ/.claude/.budget-warned"

exit 0
