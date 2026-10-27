#!/bin/bash
# .claude/hooks/post-edit-typecheck.sh
# Run TypeScript --noEmit on the affected workspace package
# Returns exit 2 if errors → Claude must fix before proceeding (auto-debug loop)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

# Skip non-TS files
case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Determine workspace package from path
PROJ="$CLAUDE_PROJECT_DIR"
WORKSPACE=""
case "$FILE_PATH" in
  $PROJ/apps/api/*)         WORKSPACE="api" ;;
  $PROJ/apps/tablet/*)      WORKSPACE="tablet" ;;
  $PROJ/apps/tv/*)          WORKSPACE="tv" ;;
  $PROJ/apps/web-admin/*)   WORKSPACE="web-admin" ;;
  $PROJ/packages/shared/*)  WORKSPACE="@restosync/shared" ;;
  *) exit 0 ;;  # not in a checkable workspace
esac

cd "$PROJ"
OUTPUT=$(pnpm --filter "$WORKSPACE" exec tsc --noEmit 2>&1)
RC=$?

if [ $RC -ne 0 ]; then
  cat <<EOF >&2
🛑 TypeScript errors in $WORKSPACE after editing $FILE_PATH
$(echo "$OUTPUT" | head -30)

Auto-debug loop: fix the errors above before continuing.
EOF
  exit 2
fi

exit 0
