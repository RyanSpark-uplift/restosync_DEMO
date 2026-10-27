# HANDOFF.md — RestoSync v6
> Cross-session memory. Claude Code 오케스트레이터 전용.
> 이 파일을 Claude Code 새 세션 시작 시 첫 프롬프트로 붙여넣기.

---

## Last session  <!-- RS-MD-AUTO:last-session -->
- Date: 2026-05-31
- Active module: M02
- Last step: (no step marker found)
- Tool calls: 7196
- MD auto-updates: 247
- ANTI hook blocks: 0
- Recent commits:
  - 5e316ac chore(md): md-keeper auto-append log for TV SDK 55 migration session
  - 66677c9 docs(M02/tv): mark RN 0.83/SDK 55 migration complete — Onn 4K verified
  - 41feadc feat(M02/tv): upgrade to RN 0.83 / Expo SDK 55 / React 19.2
  - 37997a5 chore(md): md-keeper auto-append log for M02 session
  - 093cdbd fix(M02): auto-clear works across all render paths + display_number never crops

## Next session — paste this prompt to Claude Code  <!-- RS-MD-AUTO:next-session -->
```
Read in this exact order, no narration:
1. CLAUDE.md
2. anti-patterns/ANTI-GLOBAL.md
3. anti-patterns/ANTI-M04.md
4. modules/CLAUDE-M04.md

Confirm: "Loaded: ✓ M04"
Brief response style ON. Resume from where Current Status left off.
```

## 🎯 프로젝트 개요

**RestoSync** = 레스토랑 주문 픽업 알림 시스템 (Awsum Solution 브랜드)
- 외부 배달 플랫폼(GrubHub, Fantuan, HungryPanda 등) 주문 수신
- 태블릿에서 주문 관리 → TV(Chromecast/Android TV)에 고객 호출 표시
- TTS 음성 안내 + 실시간 WebSocket push

**아키텍처:**
```
외부 플랫폼 ──webhook(HTTPS)──→ API Server (Fastify + PG + Redis)
                                    ↓ WebSocket
                              태블릿 (주문 관리 UI)
                                    ↓ Cast SDK
                              Chromecast / Android TV (고객 디스플레이)
```

**스택:** Node.js 20 LTS · Fastify 4 · PostgreSQL 16 · Redis 7 · Drizzle ORM · pnpm monorepo · Turborepo

---

## 📅 Phase plan

| Phase | 모듈 | 상태 |
|-------|------|------|
| Phase 1 | M05 API Server, M02 Order Pickup Display (legacy emerald) | ✅ 완료 |
| Phase 2 | M02 12-theme RN port (apps/tv) + ttf 번들 | ✅ 완료 (2026-05-19) |
| Phase 3 | M04 Tablet App, M01 Menu Board | 🟡 진행 중 (M01 P1 Page A~E 완료) |
| Phase 4 | M03 Event Board, 결제 연동 | ⏳ 대기 |

**Phase 2 진행 (2026-05-16 ~ 05-19):**
- `apps/tv/src/screens/pickup/ThemedPickup.tsx` 신설 — 12-theme system 전체 토큰 적용.
- `SingleVenuePickupScreen` themed/legacy 분기. theme_key 미설정 store는 emerald 유지.
- expo-font + `useThemeFonts()` 로더. ttf 미존재 시 system fallback (silent substitution 금지).
- **2026-05-19**: 23 ttf 번들 완료 (1.1MB total, SIL OFL 1.1). `fontAssets.ts` 23줄 활성화 + tsc clean.
  - Inter (5w), Manrope (3w), DMSerifDisplay, PlayfairDisplay, CormorantGaramond, BebasNeue,
    SpaceGrotesk (2w), Fraunces, Quicksand (3w), Lora (2w), Cinzel (2w), FamiljenGrotesk.
  - Metro 인식: `pnpm --filter @restosync/tv start --reset-cache` 1회 실행 필요.

---

## Last session — 2026-05-09

**Module:** M05 API Server + M02 Order Pickup Display — **완료**

### M05 완료 항목:
1. ✅ Docker Compose (PG 16-alpine + Redis 7-alpine, healthcheck, named volumes)
2. ✅ DB 스키마 (7 테이블 + 5 enum, Drizzle ORM) — `apps/api/src/db/schema.ts`
3. ✅ 마이그레이션 (0000~0002 — 7테이블 + 인덱스 + enum 변경)
4. ✅ pnpm 워크스페이스 + Turborepo 설정
5. ✅ shared/enums.ts (AG-013 정본 — 5개 enum)
6. ✅ drizzle.config.ts + migrate 완료
7. ✅ 서버 코어 (server.ts, index.ts — graceful shutdown)
8. ✅ DB/Redis 연결 (db.ts, redis.ts)
9. ✅ Auth 미들웨어 (JWT) + HMAC 미들웨어 (AG-012, AG-019)
10. ✅ Auth 라우트 (login/refresh/me/logout — AG-005, AG-006)
11. ✅ Orders 라우트 (GET/POST/PATCH/:id/status/stats)
12. ✅ WebSocket handler + broadcast 유틸 (store_id room, JWT auth)
13. ✅ Menu 라우트 (GET/POST/PATCH/DELETE/toggle/upload) — `routes/menu.ts`
14. ✅ Events 라우트 (GET/POST/PATCH/DELETE/active/upload) — `routes/events.ts`
15. ✅ node-cron 스케줄러 (매 분 event active 자동 갱신) — `services/scheduler.ts`
16. ✅ TV 페어링 라우트 (GET/POST/pair/claim/heartbeat/content) — `routes/screens.ts` (AG-008)
17. ✅ Webhook 라우트 (grubhub/doordash/ubereats) — `routes/webhook.ts` (AG-012, AG-019)
18. ✅ Seed 데이터 — `db/seed.ts` (demo-store-a + user pin:1234 + menu×5 + event×1 + tv×3)
19. ✅ **35/35 테스트 통과** (vitest) + tsc --noEmit clean

### M02 완료 항목:
1. ✅ `apps/api/src/routes/screens.ts` — claim 응답에 `device_token` (365d JWT) 추가
2. ✅ `apps/tv-pickup/index.html` — 단일 파일 SPA (HTML + CSS + JS)
   - Pairing view (API URL + 6자리 코드 입력)
   - Loading view (spinner)
   - Main view: header + Preparing / Ready 2컬럼 1920×1080
   - Error overlay + Offline banner (AG-014)
   - WS 자동 재연결 3초 + countdown (AG-002)
   - 이벤트: order:new / order:status_changed / display:order_ready / display:order_remove / order:cancelled (AG-003)
   - TTS `SpeechSynthesisUtterance.onerror → playFallback()` (AG-007)
   - state 전체 보관, render 시 `.slice(-8)` (ANTI-M02-002)
   - `fetchCurrentOrders()` on `connection:ack` (초기 동기화)
3. ✅ **35/35 테스트 회귀 없음** + tsc clean

**Open issues:** 없음
**다음 작업:** M04 Tablet App (React Native / Expo)

---

## Next session — 이 프롬프트를 Claude Code에 붙여넣기

```
Read in this exact order, no narration:
1. CLAUDE.md
2. anti-patterns/ANTI-GLOBAL.md
3. anti-patterns/ANTI-M04.md
4. modules/CLAUDE-M04.md

Confirm: "Loaded: ✓ M04"
Brief response style ON.

[현재 상태]
M05 API Server — 완료. 35/35 테스트. TypeScript clean.
M02 Order Pickup Display — 완료. apps/tv-pickup/index.html (단일 파일 SPA).

완료된 API 엔드포인트:
- POST /api/auth/login → { access_token, refresh_token }
- GET/POST /api/orders | PATCH /api/orders/:id/status | GET /api/orders/stats
- GET/POST /api/menu/items | PATCH toggle | DELETE | POST /api/menu/upload
- GET/POST /api/events | GET /api/events/active | PATCH/DELETE | POST /api/events/upload
- GET/POST /api/screens | POST /api/screens/:id/pair | POST /api/screens/claim → device_token
- POST /api/screens/:id/heartbeat | PATCH /api/screens/:id/content
- POST /webhook/grubhub | /webhook/doordash | /webhook/ubereats
- GET /health | WS /ws?store_id=UUID&device_type=tablet|tv&token=JWT

[다음 작업]
M04 Tablet App (React Native / Expo):
1. Expo Router v3 설정 + (onboarding)/ 레이아웃
2. Login 화면 (PIN 입력 + /api/auth/login)
3. (tabs)/ 레이아웃 — Orders / Menu / Events 탭
4. Orders 탭 (주문 목록 + PATCH status)
5. WS 연결 + 실시간 order:new 수신
6. AG-002 재연결, AG-014 4-state UI

1번부터 시작해.

[준수 사항]
- MCP 사용 금지.
- Brief output: [M04·Step N/M] one line.
- WS 이벤트명 정본 (AG-003): order:new, order:status_changed, order:mark_ready 등
- AG-002: WS reconnect 3초
- AG-014: 모든 화면 Loading/Empty/Error/Offline 4-state
- Zustand store: slice(-N) 렌더만, state 전체 보관
```

---

## 📦 Monorepo 구조 (현재)

```
restosync/
├── CLAUDE.md                          ← 마스터 컨텍스트
├── AGENTS.md                          ← sub-agent 정의
├── MD-MAINTENANCE.md                  ← .md 자동 유지보수 정책
├── MARKET-STRATEGY-UPDATE.md          ← 시장 전략
├── TOOL-REVIEW.md                     ← 패키지 허용 목록
├── TOKEN-MONITOR.md                   ← 토큰 모니터링
├── HANDOFF.md                         ← 이 파일
├── docker-compose.yml                 ← PG 16 + Redis 7
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.json
├── drizzle.config.ts
├── .env.example
├── .claude/
│   ├── settings.json                  ← bypassPermissions + 12 hooks
│   └── hooks/
│       ├── session-start.sh
│       ├── pre-bash-guard.sh
│       ├── pre-bash-pkg-guard.sh      ← 패키지 화이트리스트
│       ├── pre-edit-schema-check.sh   ← enum drift 방지
│       ├── post-edit-format.sh
│       ├── post-edit-typecheck.sh
│       ├── post-edit-md-touch.sh
│       ├── token-monitor.sh
│       ├── stop-run-tests.sh
│       ├── stop-md-update.sh
│       ├── session-end.sh
│       └── session-end-md.sh
├── anti-patterns/
│   ├── ANTI-GLOBAL.md                 ← AG-001 ~ AG-019 (19개)
│   ├── ANTI-M01.md ~ ANTI-M05.md
├── modules/
│   ├── CLAUDE-M01.md                  ← Menu Board
│   ├── CLAUDE-M02.md                  ← Order Pickup Display
│   ├── CLAUDE-M03.md                  ← Event Board
│   ├── CLAUDE-M04.md                  ← Tablet App
│   └── CLAUDE-M05.md                  ← API Server
├── packages/
│   └── shared/
│       └── src/
│           └── enums.ts               ← AG-013 정본 (5개 enum)
└── apps/
    └── api/
        └── src/
            ├── server.ts              ← Fastify 앱 빌드
            ├── index.ts               ← main() + graceful shutdown
            ├── types.ts               ← FastifyInstance.redis, JWTPayload
            ├── server.test.ts
            ├── db/
            │   ├── db.ts              ← Drizzle + pg Pool
            │   ├── redis.ts           ← ioredis lazyConnect
            │   ├── schema.ts          ← 7 테이블 정의
            │   └── migrations/
            │       ├── 0000_magenta_menace.sql
            │       ├── 0001_partial-indexes.sql
            │       └── 0002_bored_lethal_legion.sql  ← enum pending/preparing
            ├── middleware/
            │   ├── auth.ts            ← JWT preHandler
            │   └── hmac.ts            ← HMAC + IP ban (AG-012, AG-019)
            ├── routes/
            │   ├── auth.ts            ← login/refresh/me/logout
            │   ├── auth.test.ts
            │   ├── orders.ts          ← GET/POST/PATCH/:id/status/stats
            │   ├── orders.test.ts
            │   ├── menu.ts            ← GET/POST/PATCH/DELETE/toggle/upload
            │   ├── menu.test.ts
            │   ├── events.ts          ← GET/POST/PATCH/DELETE/active/upload
            │   ├── events.test.ts
            │   ├── screens.ts         ← GET/POST/pair/claim/heartbeat/content (AG-008)
            │   ├── screens.test.ts
            │   ├── webhook.ts         ← grubhub/doordash/ubereats (AG-012, AG-019)
            │   └── webhook.test.ts
            ├── services/
            │   └── scheduler.ts       ← node-cron event active 자동 갱신
            └── ws/
                ├── handler.ts         ← WS /ws JWT auth + room management
                ├── handler.test.ts
                └── broadcast.ts       ← in-memory room Map + broadcast()
└── apps/tv-pickup/
    └── index.html                     ← M02 SPA (Pairing+Loading+Main+Error+Offline)
```

---

## 🗃️ DB 스키마 (7 테이블)

| 테이블 | 용도 | 핵심 컬럼 |
|--------|------|-----------|
| stores | 매장 정보 | id, name, timezone, plan |
| users | 매장 직원 | id, store_id, name, pin_hash, role |
| refresh_tokens | JWT 폐기 추적 (AG-006) | jti, user_id, revoked_at, revoke_reason |
| menu_items | 메뉴 | id, store_id, name, category, daypart, price |
| orders | 주문 | id, store_id, display_number, status, source |
| tv_screens | TV 연결 (AG-008) | id, store_id, role, pairing_code, pairing_expires_at |
| events | 이벤트/공지 | id, store_id, title, type, start_at, end_at |

**핵심 인덱스:**
- `orders_active_dn_uniq` — AG-018 partial unique (collected/cancelled 제외)
- `tv_pairing_code_uniq` — AG-008 partial unique (NULL 제외)

---

## ⚠️ Anti-pattern 규칙 (AG-001 ~ AG-019)

| AG | 규칙 | 적용 위치 |
|----|------|-----------|
| AG-001 | 모든 DB 쿼리에 store_id WHERE 필수 | 전역 |
| AG-003 | WS 이벤트명 정본만 사용, 임의 생성 금지 | WebSocket |
| AG-004 | Drizzle ORM만 사용, raw SQL 금지 | DB |
| AG-005 | PIN 서버 사이드 잠금 (3회→30초) | Auth |
| AG-006 | JWT refresh jti + revocation | Auth |
| AG-008 | TV pairing 만료 + unique partial index | TV |
| AG-010 | Phase 2+ 코드 featureFlag off | 전역 |
| AG-011 | 모든 에러 수정 → ANTI-Mxx.md 기록 | 전역 |
| AG-012 | Webhook HMAC raw body + timingSafeEqual | Webhook |
| AG-013 | Enum 정본 = shared/enums.ts, drift 금지 | 전역 |
| AG-014 | UI 4-state: Loading/Empty/Error/Offline | Frontend |
| AG-015 | API rate limit 100/min/IP | 전역 |
| AG-016 | orderSource에 grubhub/fantuan/hungrypanda 포함 | Orders |
| AG-017 | 패키지 설치 → TOOL-REVIEW.md 등록 필수 | 전역 |
| AG-018 | 멀티테넌트 unique = (store_id, col) composite/partial | DB |
| AG-019 | /webhook/* 별도 rate limit + HMAC 실패 IP ban | Webhook |

---

## 🔢 Enum 정본 (packages/shared/src/enums.ts)

| Enum | Values |
|------|--------|
| OrderStatus | pending, preparing, ready, collected, cancelled |
| OrderSource | manual, doordash, ubereats, grubhub, fantuan, hungrypanda |
| ScreenRole | menu, pickup, event, ai_ads |
| EventType | happy_hour, live_event, lto, alert, promo |
| Daypart | breakfast, lunch, dinner, all |

---

## 🔜 Backlog

### Phase 1 (현재)
- [x] M05: Docker + PG + Redis 인프라
- [x] M05: DB 스키마 + 마이그레이션
- [x] M05: Auth 라우트 (login/refresh/me/logout)
- [x] M05: Orders 라우트 CRUD
- [x] M05: WebSocket handler (store_id room, JWT auth)
- [x] M05: Menu 라우트 CRUD + 이미지 업로드
- [x] M05: Events CRUD + node-cron 스케줄러
- [x] M05: TV pairing 라우트 (AG-008)
- [x] M05: Webhook 수신 라우트 (AG-012, AG-019)
- [x] M05: seed.ts (demo-store-a 파일럿 데이터)
- [x] M02: Order Pickup Display (TV 화면 — HTML SPA) — `apps/tv-pickup/index.html`
- [ ] M05 + M02 통합 테스트 (실 서버 + TV 브라우저)

### Phase 2
- [ ] M04: Tablet App (React Native / Expo)
- [ ] M01: Menu Board Display (TV 화면)

### Phase 3+
- [ ] M03: Event Board Display
- [ ] 결제 연동 (Stripe Connect)
- [ ] 다중 매장 관리 대시보드

---

## ⚠️ Critical context (항상 유지)

1. **BullMQ는 MIT 라이선스** — 이전 PT에서 "BSL"로 잘못 기재됨. 라이선스 주장은 항상 web_search 검증.
2. **하네스 skill v1.1 일반 템플릿을 RestoSync 위에 덮지 말 것** — v5는 이미 RestoSync 맞춤형. 덮으면 placeholder 노출 + 커스터마이즈 손상.
3. **MCP 사용 금지** — web_search/file_create/view/bash 등 기본 도구만.
4. **응답 스타일** — 한국어+영어 혼합, Brief output ([Mxx·Step N/M] one line), 코드 재출력 금지.
5. **Chromecast/Android TV** — Cast SDK 사용. HTML→MP4 변환 방식은 PoC에서 검증 완료 (edge-tts + FFmpeg).
6. **첫 파일럿 매장** — Ryan 운영 Demo Store A (123 Main St, San Diego).
7. **Enum 변경 이력** — 2026-05-09: `new`→`pending`, `prep`→`preparing`; `pos`, `kiosk` ORDER_SOURCE에서 제거. DB 마이그레이션 완료 (0002).

---

## 📋 모듈별 세션 시작 프롬프트 (참고)

### M05 API Server (현재)
```
Read: CLAUDE.md → ANTI-GLOBAL.md → ANTI-M05.md → CLAUDE-M05.md
Confirm: "Loaded: ✓ M05"
```

### M02 Order Pickup Display
```
Read: CLAUDE.md → ANTI-GLOBAL.md → ANTI-M02.md → CLAUDE-M02.md
Confirm: "Loaded: ✓ M02"
```

### M04 Tablet App
```
Read: CLAUDE.md → ANTI-GLOBAL.md → ANTI-M04.md → CLAUDE-M04.md
Confirm: "Loaded: ✓ M04"
```

### M01 Menu Board
```
Read: CLAUDE.md → ANTI-GLOBAL.md → ANTI-M01.md → CLAUDE-M01.md
Confirm: "Loaded: ✓ M01"
```

### M03 Event Board
```
Read: CLAUDE.md → ANTI-GLOBAL.md → ANTI-M03.md → CLAUDE-M03.md
Confirm: "Loaded: ✓ M03"
```
