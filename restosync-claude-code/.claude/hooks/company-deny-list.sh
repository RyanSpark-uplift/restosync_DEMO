#!/bin/bash
# .claude/hooks/company-deny-list.sh — RestoSync 전용
# ★ DENY LIST: 회사/프로젝트 장애 패턴 즉시 차단 + 시니어 Slack 알림
# TIER 1: 즉시 차단 | TIER 2: 경고 + 로그

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""')

PROJ="${CLAUDE_PROJECT_DIR:-$(pwd)}"
COMBINED="$CMD $CONTENT"

# ─────────────────────────────────────────────
# TIER 1: 즉시 차단 + 시니어 알림
# ─────────────────────────────────────────────
declare -A CRITICAL=(
  # DB 파괴 패턴
  ["DROP_TABLE"]='DROP\s+(TABLE|DATABASE|SCHEMA)'
  ["TRUNCATE"]='TRUNCATE\s+TABLE'
  ["DELETE_NO_WHERE"]='DELETE\s+FROM\s+\w+\s*;?\s*$'
  ["UPDATE_ALL"]='UPDATE\s+\w+\s+SET\s+.*WHERE\s*1\s*=\s*1'

  # Git 사고
  ["FORCE_PUSH"]='git\s+push\s+(--force|-f|--force-with-lease)\b'
  ["HARD_RESET"]='git\s+reset\s+--hard\s+origin/'
  ["GIT_CLEAN"]='git\s+clean\s+-fd'

  # 운영 DB 직접 접속
  ["PROD_DB"]='psql\s+.*(prod|production|live)'
  ["PROD_DB2"]='DATABASE_URL.*prod'

  # 시크릿 노출
  ["SECRET_LOG"]='console\.(log|info|debug).*?(password|secret|token|pin|jwt)'
  ["HARDCODED_SECRET"]='(JWT_SECRET|DB_PASSWORD|SECRET_KEY)\s*=\s*["\x27][A-Za-z0-9+/]{8,}'

  # ── RestoSync 전용 패턴 ──────────────────────
  # AG-001: store_id 없는 전체 테이블 수정 (멀티테넌트 파괴)
  ["NO_STORE_ID_UPDATE"]='db\.(update|delete)\(.*\)\.where\([^)]*\)(?!.*store_id)'
  # AG-003: WS 이벤트명 대문자 (과거 버그 패턴)
  ["WS_UPPERCASE"]='emit\s*\(\s*["\x27][A-Z_]+_[A-Z_]+["\x27]'
  # AG-005: PIN 평문 저장
  ["PIN_PLAINTEXT"]='pin\s*[:=]\s*(req\.body\.pin|pin)\s*(?!.*bcrypt|hash)'
  # AG-012: Webhook 라우트에 HMAC 없음
  ["WEBHOOK_NO_HMAC"]="app\.(post|get)\s*\(\s*['\"]\/webhook\/.*preHandler.*\).*(?!hmac|HMAC)"
)

BLOCKED=false
BLOCKED_REASON=""

for key in "${!CRITICAL[@]}"; do
  pattern="${CRITICAL[$key]}"
  if echo "$COMBINED" | grep -qiE "$pattern"; then
    BLOCKED=true
    BLOCKED_REASON="[$key] $pattern"

    cat <<EOF >&2

🚨 RestoSync DENY LIST — TIER 1 차단
   패턴 ID : $key
   패턴    : $pattern
   이유    : 과거 장애/버그 유발 패턴 (ANTI-GLOBAL.md 참조)

EOF

    # 사고 로그
    echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"tier\":1,\"key\":\"$key\",\"cmd\":\"$(echo "$CMD" | head -c 200)\"}" \
      >> "$PROJ/.claude/incident-log.jsonl" 2>/dev/null || true

    # 시니어 Slack 알림
    if [ -n "${RS_SENIOR_ALERT_WEBHOOK:-}" ]; then
      curl -s -X POST "$RS_SENIOR_ALERT_WEBHOOK" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"🚨 *RestoSync DENY LIST 차단*\\n패턴: \`$key\`\\n즉각 확인 필요\"}" \
        >/dev/null 2>&1 &
    fi

    # macOS 알림
    command -v osascript >/dev/null 2>&1 && \
      osascript -e "display alert \"🚨 DENY LIST: $key\" as critical" 2>/dev/null || true

    exit 2
  fi
done

# ─────────────────────────────────────────────
# TIER 2: 경고 + 로그 (차단 안 함)
# ─────────────────────────────────────────────
WARNINGS=(
  'NODE_ENV=production'
  'pnpm.*deploy'
  'kubectl\s+'
  'terraform\s+(apply|destroy)'
)

for pattern in "${WARNINGS[@]}"; do
  if echo "$COMBINED" | grep -qiE "$pattern"; then
    echo "⚠️  DENY LIST TIER2 경고: $pattern" >&2
    echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"tier\":2,\"pattern\":\"$pattern\"}" \
      >> "$PROJ/.claude/incident-log.jsonl" 2>/dev/null || true
  fi
done

exit 0
