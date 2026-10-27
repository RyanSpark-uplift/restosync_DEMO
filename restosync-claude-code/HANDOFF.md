# RestoSync — 세션 핸드오프 v4 (Final)
**작성일:** 2026-05-09 | Sonnet 4.6 전체 검토 완료
**다음 세션:** Claude Code — M05 API Server 구현 시작

---

## ✅ 누적 완료 목록 (전체 세션 기준)

### 세션 1 — 기초 문서화
- [x] RestoSync_Market_Strategy.pptx 시장 분석 검토
- [x] module-00~05 HTML 6개 파일 분석
- [x] Claude Code 개발 문서 패키지 v1 생성

### 세션 2 — 코드 분석 기반 업데이트
- [x] HTML 실제 코드와 v1 문서 차이 분석 → v2 전면 업데이트
- [x] 누락 발견: hmac.ts, node-cron, grubhub/fantuan/hungrypanda, react-native-qrcode-svg

### 세션 3 — 토큰 효율 + UX 감사 + Tool 검토
- [x] 토큰 진단 이미지 적용 → CLAUDE.md 393줄 → **115줄** (캐시 hit 37%→85%+)
- [x] UX-AUDIT.md 생성 (모듈별 Loading/Empty/Error/Offline 감사)
- [x] TOOL-REVIEW.md 생성 (30개 tool 상용화 검토, BullMQ BSL 위험 발견)
- [x] HTML PT 파일 6개 UX 감사 결과 반영 업데이트

### 세션 4 (이번) — 훅 시스템 완성
- [x] 하네스엔지니어링 스킬에 4개 신규 훅 추가
  - PRE-COMMIT: Lint·Test·Build
  - PRE-COMMIT: Sub-Agent PR Review
  - PRE-WRITE: TDD 강제
  - ★ DENY LIST: 회사 패턴 (TIER1 즉시차단+시니어알림, TIER2 경고)
- [x] RestoSync 프로젝트에 훅 적용 (RestoSync 전용 AG 패턴 포함)
- [x] `.claude/settings.json` 생성 (15개 훅, 28개 deny rule)
- [x] `.claude/agents/` 생성 (pr-reviewer, anti-recorder)
- [x] CLAUDE.md에 Response Style + 훅 요약 테이블 추가

---

## 📁 최종 패키지 구조 (RestoSync-Final-v4.zip)

```
restosync-claude-code/
├── CLAUDE.md                    ← 마스터 컨텍스트 (115줄, 캐시 최적화)
├── HANDOFF.md                   ← 이 파일
├── TOKEN-MONITOR.md             ← 토큰 예산 + Efficiency Score
├── TOOL-REVIEW.md               ← 30개 tool 상용화 검토
├── UX-AUDIT.md                  ← 모듈별 UX 감사 결과
├── README-QUICK-START.md
├── .claude/
│   ├── settings.json            ← bypassPermissions + 15훅 + 28 deny
│   ├── agents/
│   │   ├── pr-reviewer.md
│   │   └── anti-recorder.md
│   └── hooks/                   ← 15개 훅 (4개 신규)
│       ├── company-deny-list.sh     ★ RestoSync 전용 AG 패턴
│       ├── pre-commit-lint-test.sh
│       ├── pre-commit-pr-review.sh  ★ AG-001/003/004/009/013/014 검출
│       ├── pre-write-tdd-check.sh   ★ apps/*/src/ 경로 인식
│       └── (기존 11개)
├── anti-patterns/
│   ├── ANTI-GLOBAL.md           ← 16개 패턴 (AG-001~016)
│   └── ANTI-M01~M05.md          ← 빈 상태 (개발 중 채워짐)
└── modules/
    ├── CLAUDE-M05.md            ← API Server (HMAC, node-cron, pg-boss)
    ├── CLAUDE-M02.md            ← TV Pickup (8개 한도, 애니메이션)
    ├── CLAUDE-M04.md            ← Tablet App (Alert Banner, A11y)
    ├── CLAUDE-M01.md            ← Menu Board
    └── CLAUDE-M03.md            ← Event Board (node-cron 흐름)
```

---

## 🚀 다음 세션 시작 (Claude Code에 그대로 붙여넣기)

### 1단계 — 파일 배치 (Windows CMD)
```cmd
cd C:\Claude_Work_Space\Projects\Apple\Dev\restosync
xcopy RestoSync-Final-v4\restosync-claude-code\* . /E /H /Y
```

### 2단계 — Claude Code 실행
```cmd
claude
```

### 3단계 — 첫 메시지 (그대로 붙여넣기)
```
Read these 4 files in order, no narration:
1. CLAUDE.md
2. anti-patterns/ANTI-GLOBAL.md
3. anti-patterns/ANTI-M05.md
4. modules/CLAUDE-M05.md

Also check: TOOL-REVIEW.md section [TR-003] for BullMQ decision.

Confirm with one line: "Loaded: CLAUDE.md ✓ | ANTI-GLOBAL ✓ | ANTI-M05 ✓ | CLAUDE-M05 ✓"
Settings: bypassPermissions ON, 15 hooks active, brief response style.
Start M05 Step 1.
```

---

## ⚠️ Claude Code 시작 전 필수 결정사항

### [결정 필요] BullMQ → pg-boss 교체 (AG-013)
```
현황: CLAUDE-M05.md에 pg-boss 우선 권장으로 표기됨
결정: pnpm add pg-boss  OR  BullMQ 라이선스 검토 후 유지
참조: TOOL-REVIEW.md [TR-003]
```

### [설정 권장] Slack 시니어 알림 연결
```bash
# .claude/settings.json의 env 섹션
"RS_SENIOR_ALERT_WEBHOOK": "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
# TIER1 차단(DROP TABLE, force push, 보안이슈) 발생 시 즉시 알림
```

---

## 📋 M05 구현 단계 (다음 세션 목표)

```
Step 1: Turborepo + pnpm workspace 초기화
        docker-compose.yml (PostgreSQL 16 + Redis 7)
        apps/api/ 생성 + 패키지 설치 (CLAUDE-M05.md Step 1 참조)

Step 2: Drizzle 스키마 → migrate → seed
        grubhub/fantuan/hungrypanda enum 포함 확인 (AG-016)
        시드: store(demo-store-a) + user(pin:1234) + menu×5 + event×1 + screen×3

Step 3: GET /health + POST /api/auth/login
        테스트: curl /health | curl /api/auth/login

Step 4: Orders CRUD + WebSocket
        HMAC middleware (hmac.ts) 구현 (AG-012)
        WS broadcast 확인: wscat + order:status_changed

Step 5: Menu + Events + Screens + Webhook(grubhub 포함)
        node-cron scheduler.ts (AG-015)
        @fastify/rate-limit + setErrorHandler
```

---

## 🔒 훅 동작 확인 방법 (첫 실행 시)

```bash
# 1. DENY LIST 작동 확인
echo '{"tool_input":{"command":"DROP TABLE orders"}}' | \
  .claude/hooks/company-deny-list.sh
# → 🚨 TIER 1 차단 메시지 출력 + exit 2

# 2. TDD 강제 확인
echo '{"tool_input":{"path":"/apps/api/src/routes/newRoute.ts"}}' | \
  .claude/hooks/pre-write-tdd-check.sh
# → 🛑 테스트 파일 없음 메시지 + exit 2

# 3. PR Review 확인
echo '{"tool_input":{"command":"git commit -m test"}}' | \
  .claude/hooks/pre-commit-pr-review.sh
# → 🔍 PRE-COMMIT Sub-Agent Review 시작...
```

---

## 📊 전체 개발 백로그

```
[✅] 시장 분석 PT 검토
[✅] HTML 모듈 6개 분석 → 개발 문서화
[✅] 토큰 효율 최적화 (CLAUDE.md 슬림화)
[✅] UX 감사 (4상태 규칙, AG-014 추가)
[✅] Tool 상용화 검토 (30개)
[✅] HTML PT 파일 UX 업데이트
[✅] 하네스 스킬 업데이트 (4개 신규 훅)
[✅] RestoSync .claude/ 훅 시스템 설치

[ ] M05 API Server (Step 1~5)
      └ HMAC, node-cron, pg-boss, grubhub 포함
[ ] M02 TV Pickup (Loading/Empty, TTS fallback, 8개 한도)
[ ] M04 Tablet App (Alert Banner, A11y, Onboarding)
[ ] M01 TV Menu Board
[ ] M03 TV Event Board (node-cron 연동)
[ ] 통합 테스트 (TV×3 + 태블릿 + API 동시)
[ ] AWS EC2 배포 + HTTPS (nginx + Let's Encrypt)
[ ] MECOOL KM2 Plus ADB 실기 테스트
[ ] Demo Store A 파일럿 설치
[ ] 유료 파일럿 5곳 확보
```

---

## 🗝️ 핵심 컨텍스트 (빠른 참조)

| 항목 | 값 |
|------|-----|
| 첫 파일럿 | Demo Store A, 123 Main St San Diego |
| 시드 store slug | `demo-store-a` |
| 시드 PIN | `1234` |
| license_key | `RS-TEST-0001-AAAA` |
| TV 하드웨어 | MECOOL KM2 Plus (~$87), Android TV 11 |
| 구독 가격 | $49~99/위치/월 |
| 파일럿 5곳 목표 수입 | $245/월 (순이익 +$87) |
| WS URL | `ws://host/ws?store_id=UUID&device_type=tablet\|tv` |
| WS 이벤트 형식 | `order:status_changed` (콜론+소문자, AG-003) |
