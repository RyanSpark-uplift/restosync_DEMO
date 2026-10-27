#!/bin/bash
# .claude/hooks/session-end-md.sh
# At SessionEnd, refresh HANDOFF.md "Last session" block.
# Runs AFTER session-end.sh (which prints summary).

PROJ="${CLAUDE_PROJECT_DIR:-$(pwd)}"
HANDOFF="$PROJ/HANDOFF.md"
TOKEN_LOG="$PROJ/.claude/token-log.jsonl"

[ -f "$HANDOFF" ] || exit 0

DATE=$(date -u +"%Y-%m-%d")
TS_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Extract activity from token-log
TOOL_CALLS=0
ACTIVE_MODULE=""
LAST_STEP=""
MD_UPDATES=0
ANTI_HITS=0

if [ -f "$TOKEN_LOG" ]; then
  TOOL_CALLS=$(wc -l < "$TOKEN_LOG" 2>/dev/null | tr -d ' ' || echo 0)
  ACTIVE_MODULE=$(grep -oE 'CLAUDE-M[0-9]{2}' "$TOKEN_LOG" 2>/dev/null | tail -1 | sed 's/CLAUDE-//')
  LAST_STEP=$(grep -oE 'Step [0-9]+/[0-9]+' "$TOKEN_LOG" 2>/dev/null | tail -1)
  MD_UPDATES=$(grep -c '"event":"md_auto_update"' "$TOKEN_LOG" 2>/dev/null)
  ANTI_HITS=$(grep -c '"event":"anti_block"\|"exit_code":2' "$TOKEN_LOG" 2>/dev/null)
  # grep -c returns 1 when 0 matches → empty var → set to 0
  [ -z "$MD_UPDATES" ] && MD_UPDATES=0
  [ -z "$ANTI_HITS" ] && ANTI_HITS=0
  [ -z "$TOOL_CALLS" ] && TOOL_CALLS=0
fi

[ -z "$ACTIVE_MODULE" ] && ACTIVE_MODULE="(unknown)"
[ -z "$LAST_STEP" ] && LAST_STEP="(no step marker found)"

# Suggest next module — Phase 1 priority order
case "$ACTIVE_MODULE" in
  M05) NEXT_MODULE="M02" ;;
  M02) NEXT_MODULE="M04" ;;
  M04) NEXT_MODULE="M01" ;;
  M01) NEXT_MODULE="M03" ;;
  M03) NEXT_MODULE="(Phase 2)" ;;
  *)   NEXT_MODULE="$ACTIVE_MODULE" ;;
esac

# Recent git commits this session
cd "$PROJ" 2>/dev/null
RECENT_COMMITS=$(git log --since="6 hours ago" --pretty=format:"  - %h %s" 2>/dev/null | head -5)
[ -z "$RECENT_COMMITS" ] && RECENT_COMMITS="  (no commits this session)"

# Build new "Last session" block
NEW_BLOCK=$(cat <<EOF
## Last session  <!-- RS-MD-AUTO:last-session -->
- Date: $DATE
- Active module: $ACTIVE_MODULE
- Last step: $LAST_STEP
- Tool calls: $TOOL_CALLS
- MD auto-updates: $MD_UPDATES
- ANTI hook blocks: $ANTI_HITS
- Recent commits:
$RECENT_COMMITS

## Next session — paste this prompt to Claude Code  <!-- RS-MD-AUTO:next-session -->
\`\`\`
Read in this exact order, no narration:
1. CLAUDE.md
2. anti-patterns/ANTI-GLOBAL.md
3. anti-patterns/ANTI-${NEXT_MODULE}.md
4. modules/CLAUDE-${NEXT_MODULE}.md

Confirm: "Loaded: ✓ ${NEXT_MODULE}"
Brief response style ON. Resume from where Current Status left off.
\`\`\`
EOF
)

# Replace the auto-managed sections (between markers)
python3 - "$HANDOFF" "$NEW_BLOCK" <<'PYEOF'
import sys, re, pathlib
path = pathlib.Path(sys.argv[1])
new_block = sys.argv[2]
text = path.read_text(encoding='utf-8')

# Pattern: from "## Last session" comment marker to next "## " heading (exclusive)
pattern = re.compile(
    r'## Last session\s*<!--\s*RS-MD-AUTO:last-session\s*-->.*?(?=\n## (?!Next session)|\Z)',
    re.DOTALL
)
# Also drop existing Next session auto block; we'll re-add it
pattern_next = re.compile(
    r'## Next session — paste this prompt to Claude Code\s*<!--\s*RS-MD-AUTO:next-session\s*-->.*?(?=\n## |\Z)',
    re.DOTALL
)

# Strip both blocks if present
text = pattern.sub('', text)
text = pattern_next.sub('', text)

# Append the fresh block after the title block
# Heuristic: insert after the first horizontal rule or at top after title
if '\n---\n' in text:
    parts = text.split('\n---\n', 1)
    text = parts[0] + '\n---\n\n' + new_block + '\n\n' + parts[1].lstrip()
else:
    text = text.rstrip() + '\n\n' + new_block + '\n'

path.write_text(text, encoding='utf-8')
PYEOF

# Log
jq -nc --arg ts "$TS_ISO" --arg module "$ACTIVE_MODULE" \
  '{ts:$ts, event:"md_auto_update", file:"HANDOFF.md", module:$module, kind:"session_end"}' \
  >> "$TOKEN_LOG" 2>/dev/null || true

echo "📝 HANDOFF.md updated (next module: $NEXT_MODULE)" >&2

exit 0
