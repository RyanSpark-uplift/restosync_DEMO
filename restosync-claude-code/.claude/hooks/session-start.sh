#!/bin/bash
# .claude/hooks/session-start.sh
# RestoSync 세션 시작 시 자동 실행 — 컨텍스트 + 토큰 budget 안내
set -e

PROJ="${CLAUDE_PROJECT_DIR:-$(pwd)}"

cat <<EOF
================================================================
🍔 RestoSync Claude Code Session
================================================================

📋 필독 순서:
  1. CLAUDE.md
  2. anti-patterns/ANTI-GLOBAL.md
  3. anti-patterns/ANTI-Mxx.md (해당 모듈)
  4. modules/CLAUDE-Mxx.md (해당 모듈)

⚙️  Mode: bypassPermissions ON (deny list 적용)
🔁 Hooks: PreToolUse / PostToolUse / Stop / SessionEnd 활성
📝 MD auto-update: post-edit-md-touch + stop-md-update + session-end-md (MD-MAINTENANCE.md 정책)

📊 Token budget (per session):
   M05 API Server : ~100K  (\$3.5)
   M02 TV Pickup  : ~50K   (\$1.8)
   M04 Tablet     : ~80K   (\$2.8)
   M01 Menu Board : ~45K   (\$1.6)
   M03 Event Board: ~30K   (\$1.1)

Type /cost anytime to check current spend.
================================================================
EOF

# Dependency check — hooks need jq + python3
MISSING=()
command -v jq      >/dev/null 2>&1 || MISSING+=("jq")
command -v python3 >/dev/null 2>&1 || MISSING+=("python3")

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "⚠️  Missing dependencies for hooks: ${MISSING[*]}"
  echo "   macOS:  brew install ${MISSING[*]}"
  echo "   Linux:  apt install ${MISSING[*]}  (or yum/dnf/pacman)"
  echo "   Without these, MD auto-update + token monitoring won't work."
fi

# Git status check — 작업 시작 전 깨끗한지 확인
if [ -d "$PROJ/.git" ]; then
  cd "$PROJ"
  CHANGES=$(git status --porcelain | wc -l)
  if [ "$CHANGES" -gt 0 ]; then
    echo "⚠️  Uncommitted changes: $CHANGES files"
    echo "   세션 시작 전 git commit 권장"
  else
    echo "✅ Working tree clean"
  fi
fi

# Schema enum 일관성 체크 (CLAUDE.md ↔ packages/shared/src/enums.ts)
if [ -f "$PROJ/packages/shared/src/enums.ts" ]; then
  echo ""
  echo "🔍 Schema enum check..."
  if grep -q "'preparing'" "$PROJ/packages/shared/src/enums.ts"; then
    echo "❌ AG-013 violation: 'preparing' found — should be 'prep'"
    exit 1
  fi
  echo "✅ Schema enums OK"
fi

exit 0
