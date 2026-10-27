#!/bin/bash
# .claude/hooks/pre-commit-pr-review.sh — RestoSync 전용
# PRE-COMMIT Sub-Agent PR Review
# git commit 직전 diff 자동 검토. 보안이슈 차단, 컨벤션·성능 경고.

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

if ! echo "$CMD" | grep -qE '^\s*git\s+commit'; then exit 0; fi

PROJ="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJ"

[ -f ".claude/.skip-pr-review" ] && rm -f ".claude/.skip-pr-review" && echo "ℹ️  PR Review skipped" >&2 && exit 0

DIFF=$(git diff --cached 2>/dev/null | head -600)
[ -z "$DIFF" ] && exit 0

echo "🔍 PRE-COMMIT Sub-Agent Review 시작..." >&2

BLOCKS=()   # 🔴 차단
WARNS=()    # 🟡 경고

# ── 보안 (차단) ────────────────────────────────
echo "$DIFF" | grep -qiE '(password|secret|api_key|token)\s*=\s*["\x27][A-Za-z0-9+/]{8,}' && \
  BLOCKS+=("🔴 SECURITY: 하드코딩된 시크릿/API 키 감지")

echo "$DIFF" | grep -qiE 'console\.(log|debug).*?(password|token|pin|secret)' && \
  BLOCKS+=("🔴 SECURITY: 민감정보 console.log 감지")

echo "$DIFF" | grep -qiE '\.pin\s*[=:]\s*[0-9]{4}' && \
  BLOCKS+=("🔴 SECURITY: PIN 하드코딩 감지 (bcrypt 해싱 필수 — AG-005)")

# ── RestoSync 컨벤션 (차단) ────────────────────
# AG-001: store_id 없는 DB 조작 (좁게 매칭 — diff 자체에 store_id 키워드 없을 때만)
# 한 PR이 schema/enum 변경 같은 store_id 무관 작업이면 오탐 → diff 길이 제한
DIFF_LINES=$(echo "$DIFF" | wc -l)
if [ "$DIFF_LINES" -lt 200 ]; then
  echo "$DIFF" | grep -qE '\+.*db\.(update|delete)\(' && \
  ! echo "$DIFF" | grep -qE 'store_id|storeId' && \
    BLOCKS+=("🔴 CONVENTION: AG-001 — store_id 필터 없는 DB 작업 (멀티테넌트 파괴 위험)")
fi

# AG-003: WS 이벤트명 대문자+언더스코어 형식 (좁게 매칭 — 정상 enum/상수 오탐 방지)
# 조건: WS 호출(emit/broadcast/ws.send) 같은 줄에 'EVENT_NAME' 형식 리터럴
echo "$DIFF" | grep -qE '\+.*(emit|broadcast|ws\.send)\s*\(\s*[{"\x27].*["\x27][A-Z]+_[A-Z]+["\x27]' && \
  BLOCKS+=("🔴 CONVENTION: AG-003 — WS 이벤트명은 콜론+소문자 (order:status_changed)")

# ── 성능 경고 ──────────────────────────────────
echo "$DIFF" | grep -qE '\+.*(for\s*\(|\.forEach|\.map\s*\()' && \
echo "$DIFF" | grep -qE '\+.*await.*db\.' && \
  WARNS+=("🟡 PERF: 루프 내 DB 쿼리 패턴 (N+1 위험)")

# ── RestoSync 컨벤션 경고 ──────────────────────
# AG-004: raw SQL
echo "$DIFF" | grep -qE '\+.*db\.execute\s*\(sql`' && \
  WARNS+=("🟡 CONVENTION: AG-004 — raw SQL. Drizzle ORM API 사용 권장")

# AG-009: /api/ prefix 없는 라우트
echo "$DIFF" | grep -qE '\+.*app\.(get|post|patch|delete)\s*\(\s*["\x27]/(?!api|webhook|health)' && \
  WARNS+=("🟡 CONVENTION: AG-009 — 라우트 /api/ prefix 확인")

# AG-013: BullMQ는 MIT (이전 v2의 경고는 사실 오류) — 더 이상 차단/경고 안 함
# (BullMQ Pro만 상용. 표준판은 자유롭게 SaaS 사용 가능)

# AG-014: UX 상태 누락 가능성
echo "$DIFF" | grep -qE '\+.*useEffect.*fetch|await fetch' && \
! echo "$DIFF" | grep -qiE 'loading|error|empty|setLoading' && \
  WARNS+=("🟡 UX-001: Loading/Error/Empty 상태 처리 확인 필요")

# ── 결과 ──────────────────────────────────────
TOTAL=$((${#BLOCKS[@]} + ${#WARNS[@]}))

if [ $TOTAL -eq 0 ]; then
  echo "✅ Sub-Agent PR Review 통과 — 이슈 없음" >&2
  exit 0
fi

echo "" >&2
echo "━━━ Sub-Agent PR Review 결과 (${#BLOCKS[@]}개 차단 / ${#WARNS[@]}개 경고) ━━━" >&2

for b in "${BLOCKS[@]}"; do echo "   $b" >&2; done
for w in "${WARNS[@]}"; do echo "   $w" >&2; done

if [ ${#BLOCKS[@]} -gt 0 ]; then
  echo "" >&2
  echo "🛑 BLOCKED: 🔴 이슈 해결 후 commit 가능" >&2
  echo "   건너뛰려면: touch .claude/.skip-pr-review" >&2

  [ -n "${RS_SENIOR_ALERT_WEBHOOK:-}" ] && \
    curl -s -X POST "$RS_SENIOR_ALERT_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"🔴 RestoSync PR Review 차단: $(printf '%s | ' "${BLOCKS[@]}")\"}" \
      >/dev/null 2>&1 &

  exit 2
fi

echo "" >&2
echo "⚠️  경고만 있음 — commit 진행 가능 (경고 해결 권장)" >&2
exit 0
