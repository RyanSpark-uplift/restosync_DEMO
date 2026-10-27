# ANTI-M05.md — M05 오류 방지 패턴
> 오류 발생 즉시 기록. 형식: [M05-NNN] YYYY-MM-DD · 증상 · 원인 · 해결 · 코드

---

## [M05-001] HMAC 서명 검증 항상 실패 또는 우회
**날짜:** 2026-05-09 (v3 사전 등록)
**증상:** 모든 webhook이 401로 차단되거나 (개발 시 secret 비어있을 때) 검증 무력화.
**원인:** `JSON.stringify(req.body)`로 서명 비교 — 키 순서/공백/유니코드 escape가 송신측 raw body와 다르므로 항상 mismatch. 또한 `===` 비교는 타이밍 공격 취약.
**해결:** Fastify `addContentTypeParser`로 raw body Buffer를 보존, `crypto.timingSafeEqual` 사용. AG-012 v3 참조.
**코드 (before):**
```typescript
const body = JSON.stringify(req.body);
const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
if (sig !== expected) return reply.status(401).send({ error: 'INVALID_SIGNATURE' });
```
**코드 (after):**
```typescript
// server.ts
app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
  try { (req as any).rawBody = body; done(null, JSON.parse(body.toString())); }
  catch (e) { done(e as Error, undefined); }
});
// hmac.ts
const raw = (req as any).rawBody as Buffer;
const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
const a = Buffer.from(sig); const b = Buffer.from(expected);
if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
  return reply.status(401).send({ error: 'INVALID_SIGNATURE' });
```

---

## [M05-002] 탈취된 refresh token으로 30일간 access 발급 가능
**날짜:** 2026-05-09 (v3 사전 등록)
**증상:** logout 후에도 탈취된 refresh token으로 access token을 무한 갱신 가능.
**원인:** refresh token에 jti(JWT ID) 부여 + 폐기 목록 관리 없음. JWT는 stateless 기본 — 폐기는 명시적 구현 필요.
**해결:** `refresh_tokens` 테이블 + Redis revocation set. logout/rotate 시 jti를 set에 추가. refresh 사용 시 set 검증.
**코드 (after):**
```typescript
// JWT payload에 jti(uuid) 포함
// Redis: revoked:jti:<jti> (TTL = refresh 만료까지)
// refresh 사용 시:
const revoked = await redis.get(`revoked:jti:${decoded.jti}`);
if (revoked) return reply.status(401).send({ error: 'TOKEN_REVOKED' });
// logout 시:
await redis.set(`revoked:jti:${jti}`, '1', 'EX', refreshTtl);
```

---

## [M05-003] display_number 매장별 unique 미강제 → 중복 카드
**날짜:** 2026-05-09 (v3 사전 등록)
**증상:** 같은 매장에서 동일 display_number로 두 번 주문 입력 시 TV에 중복 카드 표시.
**원인:** `orders.display_number`에 unique 없음. 활성 주문(미수령/미취소)만 매장별로 unique여야 함 (취소된 번호는 재사용 가능해야 자연스러움).
**해결:** PostgreSQL partial unique index. AG-018 적용.
**코드 (after, 마이그레이션 raw SQL):**
```sql
CREATE UNIQUE INDEX orders_active_dn_uniq
  ON orders (store_id, display_number)
  WHERE status NOT IN ('collected','cancelled');
```

---

## [M05-004] TV pairing_code 영구 유효 + 중복 가능
**날짜:** 2026-05-09 (v3 사전 등록)
**증상:** 한 번 발급된 6자리 pairing 코드가 영구 유효 → brute-force(36^6 = 2.2B) 위험. 이론적으로는 같은 코드 중복 발급도 가능.
**원인:** `pairing_code`에 만료 컬럼 없음, unique 제약 없음.
**해결:** `pairing_expires_at` 추가 (10분), partial unique index. POST /api/screens/pair에서 만료 검증 + 성공 시 NULL 처리. AG-008 v3 참조.
**코드 (after, 마이그레이션 raw SQL):**
```sql
ALTER TABLE tv_screens ADD COLUMN pairing_expires_at timestamp;
CREATE UNIQUE INDEX tv_pairing_code_uniq
  ON tv_screens (pairing_code)
  WHERE pairing_code IS NOT NULL;
```

---

## [M05-005] Webhook DoS 미보호
**날짜:** 2026-05-09 (v3 사전 등록)
**증상:** Webhook이 rate limit 제외되어 spam 공격 시 DB 폭격.
**원인:** UX-AUDIT의 "Webhook은 제외" 가이드 정확하지만 별도 보호 누락.
**해결:** /webhook/* 별도 더 높은 rate limit + HMAC 실패 IP short-ban. AG-019 적용.
**코드 (after):**
```typescript
app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/webhook/')) return;
  const banned = await app.redis.get(`webhook:ban:${req.ip}`);
  if (banned) return reply.status(429).send({ error: 'BANNED' });
});
// HMAC 실패 시:
const fails = await redis.incr(`webhook:fail:${ip}`);
if (fails === 1) await redis.expire(`webhook:fail:${ip}`, 3600);
if (fails >= 5) await redis.set(`webhook:ban:${ip}`, '1', 'EX', 3600);
```

---

## [M05-006] drizzle-kit migrate SQL 파싱 실패 — 주석 블록 안의 DDL silent skip
**날짜:** 2026-05-11
**증상:** `drizzle-kit migrate`가 "migrations applied successfully!" 출력했지만, `--`로 시작하는 주석 블록이 앞에 붙은 SQL 파일에서 해당 블록 안의 CREATE TABLE / ALTER TABLE 구문이 실제로 실행되지 않음.
**원인:** drizzle-kit이 `;` 구분자로 statement 분리 시, 앞에 붙은 주석행과 묶인 첫 statement를 주석으로 간주하거나 silently skip.
**해결:** `apply-migrations.ts` 작성 — `;` 분리 후 각 chunk에서 `--`로 시작하는 줄 제거, 비어있지 않은 statement만 순서대로 개별 실행. `IF NOT EXISTS` / `already exists` 에러는 idempotent skip.
**재발방지:** migration SQL 파일 최상단 주석 블록을 SQL statement와 분리하거나, drizzle-kit 대신 직접 runner 사용.

---

## [M05-007] menu_items 컬럼 누락 — migration 중복 실행 판정 오탐
**날짜:** 2026-05-11
**증상:** seed.ts 실행 시 `column "photo_url_nobg" of relation "menu_items" does not exist` 에러.
**원인:** 0004 migration이 drizzle journal에 이미 적용된 것으로 기록되어 있었으나, 실제 ALTER TABLE 구문이 실행되지 않음 (M05-006 파생).
**해결:** `fix-columns.ts` 작성 — `ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS ...` 직접 실행.
**재발방지:** migration 적용 후 `SELECT column_name FROM information_schema.columns WHERE table_name=...` 으로 실제 컬럼 존재 검증.

---

## [M05-008] WS connection:ack 타임아웃 — open→waitForEvent race condition
**날짜:** 2026-05-11
**증상:** E2E 테스트에서 `wsConnect()` 이후 `waitForEvent(ws, 'connection:ack')` 가 2000ms 타임아웃.
**원인:** WS `open` 이벤트 → `resolve(ws)` → `waitForEvent` 리스너 등록 사이에 서버가 이미 `connection:ack` 메시지를 전송 완료. 로컬루프 연결이라 수 ms 내 도달, 리스너 등록 전 소비됨.
**해결:** `BufWs` 래퍼 — WebSocket 객체 생성 직후(`open` 이전)부터 `message` 이벤트를 내부 배열에 버퍼링. `waitFor()` 호출 시 버퍼에 이미 있으면 즉시 resolve, 없으면 pending 콜백 등록.
**재발방지:** 서버 내장 WS 클라이언트 테스트는 항상 BufWs 패턴 사용. `ws.on('message')` 직접 사용 금지.

---

## [M05-009] `.env` 미로드 → CORS allowlist 기본값으로 web client 차단
**날짜:** 2026-05-12
**증상:** Tablet web에서 `POST /api/auth/login` 요청 시 API 서버에 `OPTIONS` preflight만 들어오고 실제 POST는 도달 안 함. 브라우저 콘솔에는 CORS 에러도 안 보일 수 있음.
**원인:** `apps/api/src/index.ts`가 dotenv 등을 import하지 않음 → `.env` 자동 로드 안 됨 → `process.env.NODE_ENV` undefined → `server.ts`의 CORS 분기에서 `else`로 빠져 기본 allowlist `['http://localhost:8081']` 사용. Expo web은 8081 점유 시 8082로 fallback해서 origin mismatch 발생. preflight 응답에 `Access-Control-Allow-Origin` 헤더가 origin과 다르면 브라우저가 실제 요청 차단.
**해결:**
1) Node 22 native `--env-file` 사용 — package.json scripts 수정:
```json
"dev":         "tsx watch --env-file=../../.env src/index.ts",
"start":       "node  --env-file=../../.env dist/server.js",
"db:migrate":  "tsx   --env-file=../../.env node_modules/drizzle-kit/bin.cjs migrate",
"db:seed":    "tsx   --env-file=../../.env src/db/seed.ts"
```
2) CORS 분기를 production만 lockdown, 그 외(`development`/undefined)는 `origin: true`:
```typescript
await app.register(cors, {
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGINS?.split(',') ?? [])
    : true,
  credentials: true,
});
```
**재발방지:**
- API 서버 시작 직후 로그에 `NODE_ENV`/주요 env 값 노출 (없으면 즉시 발견)
- CORS 기본은 dev에서 `origin: true`, prod에서만 명시 allowlist
- Expo web은 8081/8082/19006 등 ephemeral port — allowlist 하드코딩 금지

---

## [M05-010] /api/auth/login 입력 스키마 vs 클라이언트 입력 mismatch
**날짜:** 2026-05-12
**증상:** Tablet PIN 입력 후 `body must have required property store_id` 에러. 사용자 화면에서 onboarding 진행 불가.
**원인:** Login API는 `{ store_id, user_id, pin }` 필수. 그러나 (onboarding) 디렉토리에 PIN 화면만 존재하고 license_key → 매장 등록 → 사용자 선택 단계가 미구현. 클라이언트는 store_id/user_id 없이 PIN만 전송.
**해결:** Login API에 `oneOf`로 두 가지 경로 모두 허용 — `(store_id, user_id, pin)` OR `(license_key, pin)`. license_key 경로는 매장 1명 사용자 환경/테스트용으로 store 조회 후 first user 자동 선택.
**코드 (apps/api/src/routes/auth.ts):**
```typescript
const loginBody = {
  type: 'object' as const,
  oneOf: [
    { required: ['store_id','user_id','pin'], properties: {...}, additionalProperties: false },
    { required: ['license_key','pin'],         properties: {...}, additionalProperties: false },
  ],
};
// handler
if ('license_key' in req.body) {
  const [store] = await db.select().from(stores).where(eq(stores.license_key, req.body.license_key));
  const [firstUser] = await db.select().from(users).where(eq(users.store_id, store.id)).limit(1);
  store_id = store.id; user_id = firstUser.id;
}
```
**재발방지:**
- API 스키마 변경 시 클라이언트 호출부 grep + 타입 sync 의무화 (`LoginResponse`/`LoginBody`를 packages/shared로 이동 권장)
- onboarding flow를 명시적 단계(license → user pick → PIN)로 분리하거나 단일 사용자 매장 단축 경로 항상 제공
- AG-005(PIN bcrypt) 보강 — multi-user 매장은 user picker 화면 필수

---

## [M05-011] GET endpoint 누락 → 클라이언트 silent fail
**날짜:** 2026-05-12
**증상:** Tablet TVs 화면에 "Failed to load TVs"만 표시, 정확한 원인 안 보임. 실제로는 `/api/tv-profiles` 라우트가 미구현이라 404. React Query는 두 query 중 한 개라도 실패하면 화면 에러 분기로 들어가지만 어느 endpoint인지 메시지에 없음.
**원인:** (1) `/api/tv-profiles` 라우트 누락. (2) 화면이 `error.message`를 노출 안 하고 고정 문구만 표시. (3) test 커버리지에서 "not yet implemented — skip" 주석으로만 처리되어 회귀 알람 없음.
**해결:**
1) 누락 라우트 추가 — `apps/api/src/routes/tvProfiles.ts` 생성 후 server.ts에 register
2) 에러 화면에 실제 메시지 노출:
```tsx
{error && (
  <Text style={s.errorTextSub}>{error instanceof Error ? error.message : String(error)}</Text>
)}
```
**재발방지:**
- 클라이언트가 호출하는 모든 endpoint를 grep으로 추출 → API route 매트릭스와 cross-check (CI 단계 권장)
- 화면 에러 UI는 항상 실제 메시지를 함께 표시 (UX-001 Error 상태 보강)
- e2e 테스트에서 "not implemented" skip 주석은 TODO 또는 xfail로 명시해서 트래킹

---

## [M05-012] JWT_SECRET 변경 시 stale token 만성 401
**날짜:** 2026-05-12
**증상:** 로그인 성공 후 다른 화면 진입 시 즉시 `UNAUTHORIZED`. localStorage엔 토큰 존재하지만 모든 API 호출 401.
**원인:** 서버 재시작 사이에 JWT_SECRET이 바뀜. 흔한 시나리오:
- 처음 시작 시 `.env` 미로드 → fallback secret 사용 (`'dev-secret-CHANGE-IN-PROD-min-256bit'`)
- 이후 `--env-file=../../.env` 추가 + 서버 재시작 → `.env`의 다른 JWT_SECRET 적용
- 클라이언트는 옛 secret으로 서명된 토큰 보관 → 새 secret으로 verify 실패
**해결:**
1) 클라이언트에 401 자동 처리 — `request()`에서 401 받으면 `clearAuth()` 호출, 사용자는 로그인 화면으로 자동 이동:
```typescript
if (res.status === 401 && token && path !== '/api/auth/login') {
  useAuthStore.getState().clearAuth();
}
```
2) 서버 dev 모드 JWT_SECRET 고정 — `.env`가 아닌 코드 상수 또는 git-ignored 고정 파일 사용 (개발자간 secret 동기화)
**재발방지:**
- 서버 시작 시 로그에 `JWT_SECRET` 일부(앞 4자, 길이) 출력하여 변경 발생 즉시 인지
- AG-006 보강 — clearAuth 트리거 사례에 "401 from access endpoint" 추가
- dev 환경 권장: `JWT_SECRET`은 `.env.local` (git-ignored)에 고정 후 .env.example엔 placeholder만

---

## [M05-013] tsx watch가 Windows에서 server.ts 변경을 가끔 못 잡음
**날짜:** 2026-05-12
**증상:** server.ts에 라우트 추가 후 새 endpoint가 404 반환. 다른 endpoint는 정상(/health 200). 파일은 디스크에 저장됨.
**원인:** Windows의 chokidar/fs.watch가 일부 에디터(에이전트 Edit/Write 포함)의 원자적 저장 패턴(임시파일→rename)을 놓치는 경우 있음. tsx watch 콘솔에 `Restarting...` 메시지가 안 뜸.
**해결:**
1) 즉시 — Ctrl+C 후 `pnpm dev` 수동 재시작
2) 확인 명령: `curl -s -o NUL -w "%{http_code}" http://localhost:3000/<new-route>` → 200이어야 적용됨
**재발방지:**
- 라우트 추가/수정 후 항상 `curl` 또는 fetch로 등록 여부 검증
- tsx watch 콘솔의 `Restarting...` 로그 확인 습관화
- 옵션: `tsx watch --clear-screen=false` 또는 `nodemon -L`(legacy polling)로 폴링 모드 사용 — CPU 사용 늘지만 변경 100% 감지
