#!/bin/bash
# .claude/hooks/pre-commit-lint-test.sh — RestoSync 전용
# PRE-COMMIT: git commit 직전 Lint · TypeCheck · Test 자동 실행

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

if ! echo "$CMD" | grep -qE '^\s*git\s+commit'; then exit 0; fi

PROJ="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJ"

[ -f ".claude/.skip-precommit" ] && rm -f ".claude/.skip-precommit" \
  && echo "ℹ️  Pre-commit skipped (one-time)" >&2 && exit 0

echo "🔍 PRE-COMMIT: Lint · TypeCheck · Test 시작..." >&2

FAILED=()
CHANGED=$(git diff --cached --name-only)

# ── 1. ESLint (staged TS 파일) ─────────────────
STAGED_TS=$(echo "$CHANGED" | grep -E '\.(ts|tsx)$' || true)
if [ -n "$STAGED_TS" ]; then
  echo "  [1/3] ESLint..." >&2
  WS=$(echo "$STAGED_TS" | head -1 | cut -d'/' -f2)  # apps/api → api
  if ! pnpm --filter "$WS" exec eslint --max-warnings 0 \
       $(echo "$STAGED_TS" | tr '\n' ' ') 2>&1 | tail -10; then
    FAILED+=("ESLint")
  else
    echo "  ✅ ESLint 통과" >&2
  fi
else
  echo "  ✅ ESLint: TS 변경 없음" >&2
fi

# ── 2. TypeCheck ───────────────────────────────
echo "  [2/3] TypeCheck..." >&2
# 변경된 워크스페이스만
for ws_path in apps/api apps/tv apps/tablet; do
  ws=$(basename "$ws_path")
  if echo "$CHANGED" | grep -q "^${ws_path}/"; then
    if ! pnpm --filter "$ws" exec tsc --noEmit --skipLibCheck 2>&1 | tail -5; then
      FAILED+=("tsc:$ws")
      echo "  ❌ TypeCheck 실패: $ws" >&2
    else
      echo "  ✅ TypeCheck 통과: $ws" >&2
    fi
  fi
done

# ── 3. Vitest (변경 워크스페이스) ──────────────
echo "  [3/3] Tests..." >&2
for ws_path in apps/api apps/tv apps/tablet; do
  ws=$(basename "$ws_path")
  if echo "$CHANGED" | grep -q "^${ws_path}/"; then
    if ! pnpm --filter "$ws" test --run 2>&1 | tail -15; then
      FAILED+=("test:$ws")
      echo "  ❌ Test 실패: $ws" >&2
    else
      echo "  ✅ Test 통과: $ws" >&2
    fi
  fi
done

# ── 결과 ──────────────────────────────────────
if [ ${#FAILED[@]} -gt 0 ]; then
  cat <<EOF >&2

🛑 PRE-COMMIT BLOCKED — 실패: ${FAILED[*]}
   "깨진 코드 머지" / "테스트 안 돌리고 PR" 방지
   한 번만 건너뛰려면: touch .claude/.skip-precommit
EOF
  exit 2
fi

echo "" >&2
echo "✅ PRE-COMMIT 통과 (Lint·TypeCheck·Test)" >&2
exit 0
