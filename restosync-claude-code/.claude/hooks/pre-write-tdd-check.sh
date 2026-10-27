#!/bin/bash
# .claude/hooks/pre-write-tdd-check.sh — RestoSync 전용
# PRE-WRITE TDD 강제: src/ 파일 작성 전 .test.ts 존재 확인

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.path // ""')

# 적용 대상: apps/*/src/ 내 .ts/.tsx (테스트 파일 제외)
if ! echo "$FILE_PATH" | grep -qE 'apps/.+/src/'; then exit 0; fi
if echo "$FILE_PATH" | grep -qE '\.(test|spec)\.(ts|tsx)$'; then exit 0; fi
if ! echo "$FILE_PATH" | grep -qE '\.(ts|tsx)$'; then exit 0; fi

# hooks/, db/migrations/, db/seed 는 제외 (설정 파일류)
if echo "$FILE_PATH" | grep -qE '/(hooks|migrations|seed|schema|config|types|index)\.(ts|tsx)$'; then exit 0; fi

PROJ="${CLAUDE_PROJECT_DIR:-$(pwd)}"
[ -f "$PROJ/.claude/.skip-tdd-check" ] && rm -f "$PROJ/.claude/.skip-tdd-check" \
  && echo "ℹ️  TDD check skipped (one-time)" >&2 && exit 0

# 이미 존재하는 파일이면 pass (수정은 허용, 신규 생성만 체크)
[ -f "${PROJ}${FILE_PATH}" ] && exit 0

BASE_DIR=$(dirname "$FILE_PATH")
BASE_NAME=$(basename "$FILE_PATH" | sed 's/\.\(ts\|tsx\)$//')

# 테스트 파일 후보 경로
TEST_PATHS=(
  "${PROJ}${BASE_DIR}/${BASE_NAME}.test.ts"
  "${PROJ}${BASE_DIR}/${BASE_NAME}.test.tsx"
  "${PROJ}${BASE_DIR}/__tests__/${BASE_NAME}.test.ts"
  "${PROJ}${BASE_DIR}/__tests__/${BASE_NAME}.spec.ts"
)

for t in "${TEST_PATHS[@]}"; do
  [ -f "$t" ] && exit 0
done

# 모듈 판별 (RestoSync 전용 메시지)
MODULE="알 수 없음"
echo "$FILE_PATH" | grep -q "apps/api"    && MODULE="M05 API Server"
echo "$FILE_PATH" | grep -q "apps/tv"     && MODULE="M01/02/03 TV App"
echo "$FILE_PATH" | grep -q "apps/tablet" && MODULE="M04 Tablet App"

cat <<EOF >&2

🛑 PRE-WRITE TDD 강제 — 테스트 파일 없음
   모듈  : $MODULE
   대상  : $FILE_PATH
   
   먼저 테스트 파일을 만드세요:
   👉 ${BASE_DIR}/${BASE_NAME}.test.ts

   TDD 순서:
   1. ${BASE_NAME}.test.ts 작성 (실패하는 테스트)
   2. ${BASE_NAME}.ts 구현 (테스트 통과)
   3. 리팩터링

   한 번만 건너뛰려면: touch .claude/.skip-tdd-check
EOF
exit 2
