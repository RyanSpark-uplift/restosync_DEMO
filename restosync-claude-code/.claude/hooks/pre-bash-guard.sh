#!/bin/bash
# .claude/hooks/pre-bash-guard.sh
# Pre-Bash safety net (fires even in bypassPermissions mode).
# Reads JSON from stdin, returns exit 2 to block.

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Defense-in-depth list (settings.json deny가 일차 방어)
DANGEROUS_PATTERNS=(
  '\brm\s+-rf\s+/'
  '\bsudo\s+'
  '\bgit\s+push\s+(--force|-f)'
  '\bdd\s+if='
  '\bmkfs\.'
  '\b:\(\)\{'
  '\bcurl\s+[^|]*\|\s*(sh|bash)'
  '\bwget\s+[^|]*\|\s*(sh|bash)'
  '>\s*/dev/sda'
  '\bnpm\s+publish\b'
  '\bpnpm\s+publish\b'
  'DROP\s+(TABLE|DATABASE)'
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$CMD" | grep -qiE "$pattern"; then
    cat <<EOF >&2
🛑 RestoSync safety hook BLOCKED dangerous command
   Pattern matched: $pattern
   Command: $CMD
   If intentional, run manually outside Claude Code.
EOF
    exit 2
  fi
done

exit 0
