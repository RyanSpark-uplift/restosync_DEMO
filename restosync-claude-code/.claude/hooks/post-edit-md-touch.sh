#!/bin/bash
# .claude/hooks/post-edit-md-touch.sh
# When code is edited, touch the related .md so user knows it may be stale.
# Conservative: only adds a single timestamp line, never rewrites content.
# Failure is silent (md updates never block coding).

INPUT=$(cat 2>/dev/null || echo "{}")
PROJ="${CLAUDE_PROJECT_DIR:-$(pwd)}"
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)

# Only react to code file edits
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.py)
    ;;
  *) exit 0 ;;
esac

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOG="$PROJ/.claude/md-stale.jsonl"
mkdir -p "$PROJ/.claude"

# Map code path → likely related md(s)
RELATED_MDS=()
case "$FILE_PATH" in
  */apps/api/src/db/schema.ts)
    RELATED_MDS+=("$PROJ/CLAUDE.md")
    RELATED_MDS+=("$PROJ/anti-patterns/ANTI-GLOBAL.md")
    ;;
  */apps/api/src/routes/*)
    RELATED_MDS+=("$PROJ/modules/CLAUDE-M05.md")
    ;;
  */apps/api/src/ws/*)
    RELATED_MDS+=("$PROJ/modules/CLAUDE-M05.md")
    RELATED_MDS+=("$PROJ/CLAUDE.md")
    ;;
  */apps/tablet/*)
    RELATED_MDS+=("$PROJ/modules/CLAUDE-M04.md")
    ;;
  */apps/tv/src/screens/MenuBoardScreen*)
    RELATED_MDS+=("$PROJ/modules/CLAUDE-M01.md")
    ;;
  */apps/tv/src/screens/PickupScreen*)
    RELATED_MDS+=("$PROJ/modules/CLAUDE-M02.md")
    ;;
  */apps/tv/src/screens/EventScreen*)
    RELATED_MDS+=("$PROJ/modules/CLAUDE-M03.md")
    ;;
  */packages/shared/src/enums.ts)
    RELATED_MDS+=("$PROJ/CLAUDE.md")
    ;;
  *) exit 0 ;;
esac

CODE_FILE=$(basename "$FILE_PATH")

# Log stale event for monitor & for md-keeper to batch later
jq -nc --arg ts "$TS" --arg code "$FILE_PATH" --argjson n_mds "${#RELATED_MDS[@]}" \
  '{ts:$ts, event:"md_stale", code:$code, related_mds:$n_mds}' \
  >> "$LOG" 2>/dev/null || true

# Append a *non-destructive* breadcrumb line in each related md if not present already
for MD in "${RELATED_MDS[@]}"; do
  [ -f "$MD" ] || continue

  # Add or ensure a "## 📝 Recent code changes (auto)" section near the bottom.
  # Idempotent: only append a line if last line for this code file is older than 60s.
  SECTION_MARKER="<!-- RS-MD-AUTO:recent-changes -->"
  if ! grep -q "$SECTION_MARKER" "$MD" 2>/dev/null; then
    {
      echo ""
      echo "---"
      echo ""
      echo "## 📝 Recent code changes (auto-tracked by hook)"
      echo "$SECTION_MARKER"
      echo ""
    } >> "$MD"
  fi

  # Avoid duplicate consecutive entries for same file
  LAST_LINE=$(tail -1 "$MD")
  ENTRY="- $TS · \`$CODE_FILE\`"
  if [ "$LAST_LINE" != "$ENTRY" ]; then
    echo "$ENTRY" >> "$MD"
  fi
done

exit 0
