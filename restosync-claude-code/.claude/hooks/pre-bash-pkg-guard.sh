#!/bin/bash
# .claude/hooks/pre-bash-pkg-guard.sh — RestoSync v3
# AG-017: 패키지 화이트리스트 — TOOL-REVIEW.md 등재 외 패키지 설치 차단
# 매칭 명령: pnpm add / npm install / npm i / yarn add

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
PROJ="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# 빠른 종료: install 명령 아니면 통과
if ! echo "$CMD" | grep -qE '^\s*(pnpm\s+(add|install)|npm\s+i(nstall)?\s|yarn\s+add)'; then
  exit 0
fi

# Skip mechanism
if [ -f "$PROJ/.claude/.skip-pkg-guard" ]; then
  rm -f "$PROJ/.claude/.skip-pkg-guard"
  echo "ℹ️  Pkg-guard skipped (one-time)" >&2
  exit 0
fi

# Allow: -D / --save-dev / --workspace 같은 플래그만 있고 패키지명 없는 경우 (재설치)
# 명령에서 패키지명 후보 추출: install/add 다음 토큰들 중 - 시작 아닌 것
ARGS=$(echo "$CMD" | sed -E 's/.*(pnpm\s+add|pnpm\s+install|npm\s+install|npm\s+i|yarn\s+add)//')

# 플래그 제거 후 패키지명만 추출
PKGS=$(echo "$ARGS" | tr ' ' '\n' | grep -E '^[@a-zA-Z]' | grep -vE '^-')

# 패키지명 없으면 통과 (lock 파일에서 재설치)
if [ -z "$PKGS" ]; then
  exit 0
fi

# TOOL-REVIEW.md에 등재된 패키지 목록 (간단한 grep으로 추출 가능한 것만)
TOOL_REVIEW="$PROJ/TOOL-REVIEW.md"
if [ ! -f "$TOOL_REVIEW" ]; then
  echo "⚠️  TOOL-REVIEW.md 미발견 — pkg-guard skip" >&2
  exit 0
fi

# 패키지명 화이트리스트 (project-local 정본은 TOOL-REVIEW.md, 여기는 빠른 매칭)
ALLOWED_PATTERNS=(
  # API
  'fastify' '@fastify/.*'
  'drizzle-orm' 'drizzle-kit' 'pg' '@types/pg'
  'ioredis' 'node-cron' '@types/node-cron'
  'bcrypt' '@types/bcrypt'
  'zod'
  'tsx' 'typescript' '@types/node'
  'bullmq' 'pg-boss' '@types/pg-boss'
  # TV / Tablet (Expo)
  'expo' 'expo-.*' 'react' 'react-native' 'react-native-.*'
  'zustand' '@tanstack/react-query'
  '@gorhom/bottom-sheet'
  '@react-native-community/.*'
  # AWS
  '@aws-sdk/.*'
  # Test
  'vitest' '@vitest/.*' 'jest' '@testing-library/.*' 'supertest' 'testcontainers'
  # Lint/format
  'eslint' '@typescript-eslint/.*' 'prettier' 'husky' 'lint-staged'
)

BLOCKED=()
for pkg in $PKGS; do
  # @scope/name@version 에서 version 부분 제거
  name="${pkg%@*}"
  # @scope/name 처럼 처음이 @인 경우는 first-@를 살림
  if [[ "$pkg" == @* ]]; then
    # @scope/name@version → @scope/name
    name=$(echo "$pkg" | sed -E 's|(@[^@/]+/[^@]+)@.*|\1|')
  fi

  matched=false
  for pat in "${ALLOWED_PATTERNS[@]}"; do
    if echo "$name" | grep -qE "^${pat}\$"; then
      matched=true
      break
    fi
  done

  # 추가로 TOOL-REVIEW.md에 패키지명이 등장하는지 grep으로 확인
  if [ "$matched" = "false" ]; then
    if grep -qE "\b${name}\b" "$TOOL_REVIEW" 2>/dev/null; then
      matched=true
    fi
  fi

  if [ "$matched" = "false" ]; then
    BLOCKED+=("$name")
  fi
done

if [ ${#BLOCKED[@]} -gt 0 ]; then
  cat <<EOF >&2

🛑 AG-017: 미승인 패키지 설치 시도
   차단된 패키지: ${BLOCKED[*]}

   다음 중 하나를 진행하세요:
   1. TOOL-REVIEW.md에 등재 + 사용자 승인 후 재시도
   2. 일회 우회: touch .claude/.skip-pkg-guard

   AG-017: Claude Code는 자율 판단으로 의존성을 추가할 수 없습니다.
   이유: 라이선스/보안/유지보수 부담은 사람이 결정.
EOF
  exit 2
fi

exit 0
