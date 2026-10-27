#!/bin/bash
# .claude/hooks/token-monitor.sh — v3.1 with rich logging
# Async (PostToolUse async:true) — non-blocking; emits JSONL for monitor.

INPUT=$(cat)
PROJ="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG="$PROJ/.claude/token-log.jsonl"
mkdir -p "$PROJ/.claude"

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
DURATION=$(echo "$INPUT" | jq -r '.duration_ms // 0')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
SUBAGENT=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // .tool_input.subagent // ""')
PROMPT=$(echo "$INPUT" | jq -r '.tool_input.prompt // .tool_input.description // ""' | head -c 80)
EXIT_CODE=$(echo "$INPUT" | jq -r '.exit_code // 0')

case "$TOOL_NAME" in
  Edit|Write|Read)
    SUMMARY=$(basename "$FILE_PATH" 2>/dev/null || echo "")
    ;;
  Bash)
    SUMMARY=$(echo "$INPUT" | jq -r '.tool_input.command // ""' | head -c 40)
    ;;
  Task)
    SUMMARY="agent:$SUBAGENT"
    ;;
  *)
    SUMMARY="$PROMPT"
    ;;
esac

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

jq -nc \
  --arg ts "$TS" \
  --arg tool "$TOOL_NAME" \
  --argjson duration "$DURATION" \
  --arg file_path "$FILE_PATH" \
  --arg subagent "$SUBAGENT" \
  --arg summary "$SUMMARY" \
  --argjson exit_code "$EXIT_CODE" \
  '{ts:$ts, tool:$tool, duration_ms:$duration, file_path:$file_path, subagent:$subagent, summary:$summary, exit_code:$exit_code}' \
  >> "$LOG" 2>/dev/null || true

if [ -n "$RS_TOKEN_BUDGET" ] && [ -f "$LOG" ]; then
  COUNT=$(wc -l < "$LOG")
  if [ "$COUNT" -gt 200 ] && [ ! -f "$PROJ/.claude/.budget-warned" ]; then
    touch "$PROJ/.claude/.budget-warned"
    echo "⚠️ Token budget warning — $COUNT tool calls" >&2
    if [ -n "$RS_NOTIFICATION_WEBHOOK" ]; then
      curl -s -X POST "$RS_NOTIFICATION_WEBHOOK" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"⚠️ RestoSync budget — $COUNT tool calls\"}" \
        >/dev/null 2>&1 &
    fi
  fi
fi

exit 0
