# RestoSync — Master CLAUDE.md
<!-- CACHE ANCHOR: v3.0 | 2026-05 | Sonnet 4.7 hardening review applied -->
> **세션 시작 시 반드시 읽는다:** CLAUDE.md → ANTI-GLOBAL.md → ANTI-Mxx.md → CLAUDE-Mxx.md
> v3 변경: AG-013 재정의, AG-017~019 신규, BullMQ 결정 종결(MIT, 그대로 사용 가능),
>          daypart 4-value로 통일, HMAC raw body, server-side PIN 잠금

---

## Project Snapshot
**Product:** Restaurant 4-screen integrated signage + order pickup + tablet SaaS  
**Stack:** Turborepo + pnpm workspaces | Node.js 22 + Fastify v4 + Drizzle + PostgreSQL 16 + Redis 7  
**TV/Tablet:** React Native TV 0.74 + Expo SDK 51 + Expo Router v3 + Zustand  
**Hardware:** MECOOL KM2 Plus (Android TV 11, Amlogic S905X4)  
**First Pilot:** Demo Store A, San Diego

---

## Monorepo Layout
```
restosync/
├── apps/api/src/
│   ├── server.ts
│   ├── routes/        # auth, orders, menu, events, screens, webhook
│   ├── ws/            # handler.ts, broadcast.ts
│   ├── services/      # orderService, menuService, scheduler(node-cron)
│   ├── middleware/    # auth.ts(JWT), hmac.ts(Webhook HMAC 서명검증)
│   └── db/            # schema.ts(Drizzle), migrations/, seed.ts
├── apps/tv/src/screens/   # MenuBoardScreen, PickupScreen, EventScreen
├── apps/tablet/app/       # _layout, (onboarding)/, login, (tabs)/
└── packages/shared/       # types, constants
```

---

## API Routes (prefix: /api/ — 예외: /webhook/, /health)
```
Auth:    POST /api/auth/login | /api/auth/refresh | GET /api/auth/me
Orders:  GET/POST /api/orders | PATCH /api/orders/:id/status | GET /api/orders/stats
Menu:    GET/POST /api/menu/items | PATCH /api/menu/items/:id/toggle | POST /api/menu/upload
Events:  GET/POST /api/events | GET /api/events/active | POST /api/events/upload
Screens: GET /api/screens | PATCH /api/screens/:id/content | POST /api/screens/:id/heartbeat
Webhook: POST /webhook/pos | /webhook/doordash | /webhook/ubereats | /webhook/grubhub
System:  GET /health
```

---

## WebSocket Protocol
```
URL: ws://host/ws?store_id=UUID&device_type=tablet|tv
Format: { "event": "TYPE", "store_id": "uuid", "ts": "ISO8601", "payload": {} }

order:new            Server→Tablet   새 주문 (payload: Order 전체)
order:status_changed Server→All      상태변경 ({order_id, status, display_number})
order:cancelled      Server→All      취소
display:order_ready  Server→TV②      픽업 하이라이트 ({display_number, flash:true})
display:order_remove Server→TV②      30초 후 제거
display:menu_refresh Server→TV①      메뉴 전체 갱신
display:item_toggle  Server→TV①      품절 토글 ({item_id, available})
display:event_push   Server→TV③      이벤트 시작 (Event 전체)
display:event_clear  Server→TV③      이벤트 종료
order:mark_ready     Tablet→Server   스태프 READY 탭
tv:heartbeat         TV→Server       30초마다 생존신호
```

---

## DB Enums (schema.ts 정본)
```typescript
orderSource: ['pos','kiosk','manual','doordash','ubereats','grubhub','fantuan','hungrypanda']
orderStatus: ['new','prep','ready','collected','cancelled']
screenRole:  ['menu','pickup','event','ai_ads']
eventType:   ['happy_hour','live_event','lto','alert','promo']
daypart:     ['breakfast','lunch','dinner','all']   // 4-value (M01 통일, AG-013 강제)
```

---

## Package Install (확정 — TOOL-REVIEW.md 라이선스 참조)
```bash
# API
pnpm add fastify @fastify/cors @fastify/jwt @fastify/websocket @fastify/multipart @fastify/rate-limit
pnpm add drizzle-orm pg ioredis node-cron bcrypt zod
pnpm add -D drizzle-kit tsx typescript @types/pg @types/bcrypt @types/node-cron
# Queue: BullMQ (MIT) 또는 pg-boss (MIT) 중 선택 — TOOL-REVIEW.md [TR-003] 참조

# TV (apps/tv)
pnpm add zustand expo-speech expo-keep-awake expo-av react-native-reanimated

# Tablet (apps/tablet)
pnpm add expo-router zustand @tanstack/react-query
pnpm add expo-secure-store expo-sqlite expo-image-picker expo-file-system expo-av
pnpm add @gorhom/bottom-sheet react-native-gesture-handler react-native-reanimated
pnpm add @react-native-community/netinfo react-native-qrcode-svg
```

> ⚠ **AG-017 적용:** 위 목록에 없는 신규 패키지는 사용자 승인 없이 설치 금지.
> Hook `pre-bash-pkg-guard.sh`가 `pnpm add` 명령에서 미승인 패키지 차단.

---

## Critical Rules
| Rule | 내용 |
|------|------|
| AG-001 | Drizzle 모든 쿼리 `store_id` WHERE 필수 |
| AG-003 | WS 이벤트명: 콜론+소문자 (`order:status_changed`) |
| AG-004 | raw SQL 금지 |
| AG-005 | PIN bcrypt 해싱 + **server-side 잠금** |
| AG-006 | JWT access(15m) + refresh(30d) + **revocation list** |
| AG-008 | TV 페어링 6자리 + 만료(10분) + unique 강제 |
| AG-009 | 모든 라우트 `/api/` prefix |
| AG-012 | Webhook **raw body HMAC + timingSafeEqual** |
| AG-013 | Schema enum drift 금지 (정본: shared/enums.ts) |
| AG-017 | 패키지 화이트리스트 — TOOL-REVIEW.md 등재만 설치 |
| AG-018 | 매장별 식별자: (store_id, col) 복합 unique |
| AG-019 | `/webhook/*` 별도 rate limit + HMAC fail short-ban |
| UX-001 | 모든 화면: Loading/Empty/Error/Offline 4상태 필수 |
| ANTI | 오류 발생 즉시 ANTI-Mxx.md 기록 |

---

## Dev Priority & Token Budget
```
① M05 API(<$3.5) → ② M02 Pickup(<$1.8) → ③ M04 Tablet(<$2.8) → ④ M01 Menu(<$1.6) → ⑤ M03 Event(<$1.1)
```
세션 중 `/cost` 명령으로 실시간 확인. 총 목표 <$11.

---

## 🗣️ Response Style (Claude Code 전용)
사용자가 묻기 전까지는 **아주 간략한 단계 표시 + 한 줄 설명**만 출력.

기본 형식:
```
[Mxx·Step N/M] short description
✓ done
```

**금지:** 진행 중 코드 재출력, "이제 X 시작…" 류 나레이션, 장문 요약, 중간 TODO 보고  
**허용 (요청 시):** "explain", "details", "show code", "보여줘" → 그때 전체 설명  
**에러:** 1줄 증상 + 1줄 원인 + 수정 (3줄 이내)  
**완료:** `✓ Mxx Step N done` 한 줄

---

## 🔒 훅 & 안전망 (자동 적용)

| 시점 | 훅 | 동작 |
|------|----|------|
| git commit 직전 | `pre-commit-lint-test.sh` | Lint·TypeCheck·Test 실패 시 차단 |
| git commit 직전 | `pre-commit-pr-review.sh` | 보안/AG위반 차단, 성능·컨벤션 경고 |
| src/ 파일 작성 전 | `pre-write-tdd-check.sh` | .test.ts 없으면 차단 (TDD 100%) |
| 모든 명령 | `company-deny-list.sh` | DROP TABLE·force push·운영DB 즉시 차단 |
| 파일 저장 후 | `post-edit-typecheck.sh` | tsc 실패 시 auto-fix loop |
| Stop 시 | `stop-run-tests.sh` | 테스트 실패 시 계속 수정 |

**Skip (긴급):**
```bash
touch .claude/.skip-precommit   # Lint·Test 1회 skip
touch .claude/.skip-pr-review   # PR Review 1회 skip
touch .claude/.skip-tdd-check   # TDD check 1회 skip
touch .claude/.skip-stop-tests  # Stop test 1회 skip
```
