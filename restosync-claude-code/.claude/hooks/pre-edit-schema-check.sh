#!/bin/bash
# .claude/hooks/pre-edit-schema-check.sh
# AG-013 enforcement — schema enum drift block
# v3: AG numbers aligned with ANTI-GLOBAL.md, daypart enforced as 4-value (M01 spec)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')

# Only check files containing schema/enum
case "$FILE_PATH" in
  *schema.ts|*enums.ts|*types.ts)
    NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_str // .tool_input.content // .tool_input.new_string // ""')

    # AG-013: forbidden legacy enum values
    if echo "$NEW_CONTENT" | grep -qE "['\"]preparing['\"]"; then
      echo "🛑 AG-013: 'preparing' is not a valid orderStatus value. Use 'prep' (CLAUDE.md DB Enums is canonical)." >&2
      exit 2
    fi
    if echo "$NEW_CONTENT" | grep -qE "['\"]toast['\"]" && echo "$FILE_PATH" | grep -qiE "order_source|orderSourceEnum"; then
      echo "🛑 AG-013: 'toast' is not a valid order_source value. POS-aggregated orders use 'pos'." >&2
      exit 2
    fi

    # AG-013 (daypart): must stay 4-value, NOT 6-value
    # Block any attempt to add 'brunch', 'late_night', etc.
    if echo "$NEW_CONTENT" | grep -qE "daypart.*=.*['\"]brunch['\"]|['\"]late_night['\"]"; then
      echo "🛑 AG-013: Daypart enum is 4-value: ['breakfast','lunch','dinner','all']. See CLAUDE.md DB Enums." >&2
      exit 2
    fi
    ;;
esac

exit 0
