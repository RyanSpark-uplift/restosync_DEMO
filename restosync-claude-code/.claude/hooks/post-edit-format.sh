#!/bin/bash
# .claude/hooks/post-edit-format.sh
# Auto-format edited TS/JS files with Prettier (via pnpm)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

# Only format relevant file types
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.json)
    if [ -f "$FILE_PATH" ]; then
      # Use project's Prettier if available, otherwise skip silently
      if [ -f "$CLAUDE_PROJECT_DIR/node_modules/.bin/prettier" ]; then
        "$CLAUDE_PROJECT_DIR/node_modules/.bin/prettier" --write "$FILE_PATH" 2>/dev/null || true
      fi
    fi
    ;;
esac

exit 0
