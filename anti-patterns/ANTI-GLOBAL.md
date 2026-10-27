# ANTI-GLOBAL.md — RestoSync 전역 오류 방지 패턴
> Sonnet 4.7 검토 v3 | 2026-05 | 모든 세션 시작 시 반드시 읽는다
> v3 변경: AG-013 재정의 (BullMQ→Schema drift), AG-017~019 신규, 일부 본문 보강

---

## [AG-001] store_id 없는 Drizzle 쿼리
**증상:** 타 매장 데이터 노출
```typescript
// ❌ const orders = await db.select().from(ordersTable);
// ✅
const orders = await db.select().from(ordersTable)
  .where(and(eq(ordersTable.store_id, storeId), eq(ordersTable.status, status)));
```

## [AG-002] WebSocket 자동 재접속 없음
**증상:** 네트워크 끊김 후 TV 화면 멈춤
```typescript
// ✅ 모든 TV/Tablet WS 훅에 필수
ws.onclose = () => setTimeout(connect, 3000);
```

## [AG-003] WS 이벤트명 오타
**증상:** 이벤트 수신 안 됨
```
// ❌ ORDER_STATUS_CHANGED  ✅ order:status_changed (콜론+소문자)
// 정본: CLAUDE.md WebSocket Protocol 섹션
```

## [AG-004] raw SQL 사용
**규칙:** Drizzle ORM API만. `db.execute(sql...)` 최소화.

## [AG-005] 인증 보안 — PIN 평문 + Client-side 잠금 ★ v3 보강
**증상:** Brute-force, 앱 재시작 시 실패카운터 리셋
```typescript
// ✅ 저장: await bcrypt.hash(pin, 10)
// ✅ 검증: await bcrypt.compare(inputPin, user.pin_hash)
// ✅ 잠금: server-side. users.failed_attempts + users.locked_until,
//         또는 Redis key `auth:lock:<store_id>:<user_id>` (TTL 30s)
//         3회 실패 시 30s 잠금. App restart로 우회 불가.
// ❌ 클라이언트 setState로만 잠금 처리 — 우회 가능
```

## [AG-006] JWT 토큰 — 단일 토큰 + 폐기 불가 ★ v3 보강
**증상:** 탈취된 refresh token으로 30일간 access 발급 가능
```typescript
// ✅ access_token (15m) + refresh_token (30d)
// ✅ refresh_token 발급 시 jti(uuid) 부여
// ✅ Redis set `revoked:jti:<jti>` 에 폐기 목록 관리 (TTL = refresh 만료까지)
// ✅ logout / 비밀번호 변경 / 의심 활동 시 jti 추가
// ✅ refresh 사용 시 jti가 revoked set에 있으면 401
// expo-secure-store에 access+refresh 저장, 401 수신 시 refresh로 자동 갱신
```

## [AG-007] Android TV TTS 크래시 — Promise/onError 패턴 ★ v3 정정
**증상:** expo-speech의 `Speech.speak()`는 Promise를 반환하지 않음 (void).
try/await 패턴이 catch를 절대 안 탐 → fallback 미작동.
```typescript
// ❌ 작동 안 함
async function announce(text: string) {
  try { await Speech.speak(text); }
  catch { await playFallbackAudio(); } // 절대 도달 안 함
}

// ✅ onError 콜백 사용
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

export function announce(text: string) {
  Speech.speak(text, {
    language: 'en-US',
    rate: 0.9,
    onError: () => {
      Audio.Sound.createAsync(
        { uri: `${process.env.EXPO_PUBLIC_S3_URL}/audio/order-ready.mp3` }
      ).then(({ sound }) => sound.playAsync());
    },
  });
}
```

## [AG-008] TV 페어링 — 만료/유일성 미강제 ★ v3 보강
**증상:** 6자리 코드(36^6 = 2.2B)지만 영구 유효 + 중복 가능 → 무차별 대입 위험
```typescript
// ✅ schema.ts tv_screens
//    pairing_code: varchar({ length: 6 })
//    pairing_expires_at: timestamp()  ← 발급 후 10분
//    + unique partial index where pairing_code IS NOT NULL
// ✅ POST /api/screens/pair — 만료 검증 + 페어링 성공 시 즉시 NULL 처리
// ✅ Onboarding Step4 반드시 구현 — TV 6자리 코드 표시
```

## [AG-009] API prefix 누락
```
// ❌ /orders  ✅ /api/orders
// 예외: /webhook/*, /health
```

## [AG-010] Phase 2 featureFlag 없음
```typescript
// ✅ const featureFlags = { aiEventDesign: false, aiMenuSuggestion: false };
// Phase 2 UI: "Coming Soon" 토스트, 코드 구조만 준비
```

## [AG-011] 오류 기록 누락
**규칙:** 모든 버그 해결 후 ANTI-Mxx.md에 즉시 기록.
3개 이상 모듈에서 동일 패턴 → AG-NNN 승격 제안 (anti-recorder agent).

## [AG-012] Webhook HMAC 검증 — raw body + timingSafeEqual ★ v3 정정
**증상:** `JSON.stringify(req.body)`로 서명 비교 시 키 순서/공백 차이로 항상 mismatch.
또한 `===` 비교는 타이밍 공격 취약.
```typescript
// ✅ middleware/hmac.ts — 모든 /webhook/* 라우트에 적용
import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';

// server.ts에서 raw body 보존:
// app.addContentTypeParser('application/json',
//   { parseAs: 'buffer' },
//   (req, body, done) => {
//     try { (req as any).rawBody = body; done(null, JSON.parse(body.toString())); }
//     catch (e) { done(e as Error, undefined); }
//   });

export function verifyHMAC(secretEnvKey: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const secret = process.env[secretEnvKey];
    if (!secret) return; // 개발 환경 — skip
    const sig = (req.headers['x-signature'] as string) ?? '';
    const raw = (req as any).rawBody as Buffer;
    if (!raw) return reply.status(400).send({ error: 'NO_BODY' });
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return reply.status(401).send({ error: 'INVALID_SIGNATURE' });
    }
  };
}
```

## [AG-013] Schema enum drift 금지 ★ v3 재정의
**기존(v2):** ~~BullMQ BSL 라이선스 위험~~ → **삭제 (사실 오류, BullMQ는 MIT)**
**신규 정의:** schema enum 값은 한 곳에서만 정의.
다른 곳에 같은 enum을 다시 적거나 폐기 값(`'preparing'`, `'toast'` 등) 사용 금지.
```typescript
// ❌ 'preparing' 같은 폐기 값 사용 → hook이 즉시 차단
// ❌ enum을 라우트 파일에 인라인으로 다시 정의
// ✅ import { orderStatus } from '@restosync/shared/enums';
```
hook: `pre-edit-schema-check.sh`가 폐기 값 차단.

## [AG-014] 4가지 UI 상태 누락 (UX-001)
**위험:** TV에서 고객 앞 빈 화면, 앱에서 무한 스피너
**규칙:** 모든 데이터 의존 화면에 Loading / Empty / Error / Offline 상태 필수.
참조: UX-AUDIT.md.

## [AG-015] node-cron ↔ TV③ 연동 흐름 미구현
**규칙:** scheduler.ts가 start_at/end_at 체크 → WS display:event_push/clear 브로드캐스트.
이 흐름 없으면 이벤트 자동 전환 안 됨.

## [AG-016] 추가 delivery source enum 누락
**발견:** HTML 실제 코드에 grubhub, fantuan, hungrypanda 포함
**규칙:** schema.ts orderSource enum에 반드시 포함
```typescript
orderSource: ['pos','kiosk','manual','doordash','ubereats','grubhub','fantuan','hungrypanda']
```

## [AG-017] 패키지 화이트리스트 — 신규 의존성 자율 추가 금지 ★ v3 신규
**위험:** Claude Code가 자율 판단으로 미승인 라이브러리 설치 → 라이선스/보안/유지보수 리스크
**규칙:**
- `pnpm add <pkg>` 또는 `npm install <pkg>` 실행 전 **반드시 TOOL-REVIEW.md 등재 확인**
- 미등재 패키지 필요 시 사용자에게 먼저 승인 요청
- hook: `pre-bash-pkg-guard.sh`가 `pnpm add` 명령에서 미등재 패키지 차단

## [AG-018] 멀티테넌트 unique 제약 누락 ★ v3 신규
**위험:** display_number 같은 매장별 식별자에 unique 누락 → 중복 카드 가능, 또는 전역 unique → 매장 간 충돌
**규칙:** 매장 격리가 필요한 컬럼은 `(store_id, <col>)` 복합 unique
```typescript
// ✅ orders: 활성 주문 한정 partial unique on (store_id, display_number)
//    where status not in ('collected','cancelled')  -- pg partial index
// ✅ tv_screens.pairing_code: partial unique where pairing_code IS NOT NULL
// ✅ stores.slug, stores.license_key: 전역 unique (매장 식별자 자체)
```

## [AG-019] Webhook DoS 미보호 ★ v3 신규
**위험:** Rate limit "webhook 제외" 정책 시 spam 폭격 가능
**규칙:** `/webhook/*` 라우트에 별도 (더 높은) rate limit 적용
```typescript
// ✅ /api/* : 100 req/min/IP
// ✅ /webhook/* : 1000 req/min/IP + HMAC 검증
// ✅ HMAC 실패 IP별 카운트 → 5회 초과 시 1시간 short-ban (Redis)
```

## [AG-020] Expo Web 호환성 체크리스트 ★ v3.1 신규 (M04 5건 통합)
**증상:** `expo start --web` 또는 `expo export --platform web` 후 브라우저 화면 완전 공백 (다크 배경도 안 보임).
원인 분리하기 어려운 이유: 단일 import-time SyntaxError 또는 인스턴스 중복은 React mount 전에 실행을 정지시켜 콘솔에 짧은 에러 1줄만 남김.
**규칙:** 새 패키지 추가 / Expo SDK 업그레이드 / React major 업그레이드 시 아래 5가지 모두 통과해야 함.

### 1. Native-only API 사용 시 Platform 분기
```typescript
// ❌ const v = await SecureStore.getItemAsync(k);  // web에서 UnavailabilityError
// ✅ web → localStorage, native → SecureStore (M04-002)
```
대상: `expo-secure-store`, `expo-sqlite` (일부), `expo-file-system` (일부), `expo-haptics`, 등.

### 2. ESM `import.meta` 사용 패키지 → CJS 강제
```bash
# 검증
grep -rE "import\.meta" node_modules/.pnpm/<pkg>*/node_modules/<pkg>/esm/ 2>/dev/null
# 매치 있으면 metro.config.js resolver.resolveRequest로 CJS 강제 (M04-003)
```
대표 사례: `zustand@4.5+` (ESM `esm/index.mjs`만 `import.meta.env.MODE` 사용, CJS `index.js`는 `process.env.NODE_ENV` 사용 → 안전).

### 3. Single-instance 강제 — react, react-dom, react-native-web
pnpm 하이스팅으로 transitive peer dep이 다른 버전을 끌어오면 동일 번들에 두 인스턴스 로드 → React invariant 실패.
```javascript
// metro.config.js — 모든 web app에 적용 권장 (M04-005)
const pinned = { react: '...', 'react-dom': '...', 'react-native-web': '...' };
config.resolver.resolveRequest = (ctx, name, platform) => {
  for (const [pkg, root] of Object.entries(pinned)) {
    if (name === pkg || name.startsWith(pkg + '/')) {
      const sub = name === pkg ? '' : '/' + name.slice(pkg.length + 1);
      return { type: 'sourceFile', filePath: require.resolve(root + sub) };
    }
  }
  return ctx.resolveRequest(ctx, name, platform);
};
```
**검증:** `grep -oE '"19\.[0-9.]+"' <bundle>.js | sort -u` → 한 버전만 나와야 함.

### 4. Reanimated ↔ Worklets 페어링
```
4.0.x ↔ 0.5.x | 4.1.x ↔ 0.6.x | 4.2.x ↔ 0.7.x | 4.3.x+ ↔ 0.8.x
```
peer dep loose(`>=0.7.0`) 때문에 pnpm이 잘못된 버전 고를 수 있음 → 직접 dep으로 명시 (M04-004).

### 5. Route group + 명시적 index
`app/(onboarding)/index.tsx` + `app/(tabs)/_layout.tsx` 만 있으면 `/` resolve가 모호 → `app/index.tsx`에서 명시적 `<Redirect>` 사용.
```tsx
// app/index.tsx
export default function Index() {
  const token = useAuthStore(s => s.token);
  const hydrated = useAuthStore(s => s.hydrated);
  if (!hydrated) return <ActivityIndicator />;
  return <Redirect href={token ? '/(tabs)/dashboard' : '/(onboarding)'} />;
}
```

### 6. `Alert.alert` 금지 — 인라인 에러 사용
React Native Web에서 `Alert.alert`는 no-op → 에러가 사용자에게 보이지 않음. Login/Submit 실패 등 모든 에러는 화면 inline 컴포넌트로 표시 (M04-006).
```tsx
const [error, setError] = useState<string|null>(null);
// ...
{error && <View style={errorBox}><Text>{error}</Text></View>}
```

### 7. `.env` 자동 로드 보장 (서버측)
`process.env.NODE_ENV` undefined 시 CORS 분기/feature flag/로그 레벨이 모두 잘못된 기본값 사용. Node 22 `--env-file` 또는 `import 'dotenv/config'` 명시 (M05-009).
```json
// apps/api/package.json
"dev": "tsx watch --env-file=../../.env src/index.ts"
```
**검증:** 서버 시작 직후 로그에 `NODE_ENV` 값 출력. CORS는 production 외엔 `origin: true`.

**진단 순서 (web 화면 공백 시):**
1. Browser DevTools Console → 첫 번째 빨간 에러 1줄
2. `SyntaxError: import.meta` → §2
3. `Incompatible React versions` → §3
4. `Worklets ... not compatible with Reanimated` → §4
5. `UnavailabilityError` → §1
6. Console 빈 채로 백색만 → §5 (라우팅) 또는 `<div id="root">` 비어있는지 Elements 탭에서 확인

**진단 순서 (API 요청 도달 안 함):**
1. Browser Network 탭 → 빨간 요청 / OPTIONS만 있고 POST 없음 → CORS 의심 → §7
2. 서버 로그에 OPTIONS 204 후 실제 method 안 들어옴 → preflight 응답에 origin 빠짐 → §7
3. Tablet UI에서 버튼 무반응 → Console 비어있어도 silent fail 가능성 → §6 (Alert.alert 사용 점검)

---

## [AG-021] 페이지네이션 API에서 클라이언트 후처리 필터링 금지 ★ v3.2 신규
**증상:** 분명히 활성 주문 27개가 있는데 Dashboard에 "All caught up!" / "No active order #X" / KPI 0.
**원인:** `GET /api/orders` 같은 list endpoint는 기본:
- `limit: 50` (default), `maximum: 100`
- `ORDER BY created_at ASC` (가장 오래된 것 우선)
- status 필터 없으면 cancelled/expired/collected 등 terminal 포함

→ 테스트로 cancelled 50건이 쌓이면 응답이 그것들로 가득 차서 새 active 주문이 잘림. 클라이언트가 `.filter(o => ACTIVE_STATUSES.includes(o.status))` 로 거르는 것은 **이미 잘린 50건 안에서만** 동작 → 응답에 active가 없으면 빈 배열.

**규칙:**
1. list endpoint 호출 시 **반드시 server-side status 필터 + 최대 limit**.
2. 클라이언트 `.filter`는 보조용일 뿐, 서버 필터의 대체가 아님.
3. mutation 직후 fresh fetch 패턴 (cache 우회) 도 동일하게 server-side 필터.

**코드 (잘못):**
```typescript
// ❌ default limit=50, ASC, all statuses
const list = await api.get<Order[]>('/api/orders');
const active = list.filter((o) => ACTIVE.includes(o.status));
```
**코드 (옳음):**
```typescript
// ✅ server-side filter + max limit
const ACTIVE = ['new','prep','ready_to_expedite','ready','remaking','scheduled'];
const list = await api.get<Order[]>(`/api/orders?status=${ACTIVE.join(',')}&limit=100`);
```
**적용 지점 (확인 필수):**
- `apps/tablet/app/(tabs)/dashboard/index.tsx` — useQuery + readyMutation
- `apps/tablet/app/(tabs)/analytics/*` — KPI 계산 전 raw list 가져올 때
- `apps/tablet/app/(tabs)/settings/engineer.tsx` — `advanceAllPrep`, `clearAllActive`
- 다른 모든 list endpoint (`/api/menu/items`, `/api/events`, …) 도 동일 점검

**display_number 재사용 주의:** 동일 매장에서 display_number는 시간이 지나면 recycle. find/match는 **반드시 활성 status 필터 + 가장 최근(`created_at` DESC)** 까지 적용. 안 그러면 cancelled 옛 주문이 매칭됨 ([M04-011] 참조).

---

## [AG-022] Heavy work를 메인 API thread에서 처리 금지 — BullMQ worker 분리 ★ v3.3 신규
**증상:** 5MB 사진 transcode 8초, OCR LLM 호출 12초, Excel 100-item parsing 6초 동안 모든 API 요청이 block → p99 폭증, WS heartbeat 끊김.
**원인:** `sharp().resize()`, `anthropic.messages.create()`, `xlsx.parse()` 등 CPU/IO heavy 작업을 라우트 핸들러 안에서 await.
**규칙:** 200ms 이상 소요 가능한 모든 작업은 **BullMQ queue + 별도 worker 프로세스**로 분리. 라우트는 job enqueue + `202 Accepted` 응답만. 결과는 polling 또는 WS event로 전달.
**승격 사유:** M01 사진 transcode + AI OCR + Excel import, M02 TTS MP3 변환, M03 이벤트 미디어 처리 — 3개 모듈에서 동일 패턴 (anti-recorder 식별 [AM01-005] 등).
```typescript
// ❌ blocking
app.post('/api/menu/upload', async (req) => {
  const img = await sharp(buf).resize(1920).webp().toBuffer();
  await s3.send(new PutObjectCommand({ Body: img, ... }));
});

// ✅ enqueue + 202
app.post('/api/menu/upload', async (req, reply) => {
  const fileKey = await s3RawUpload(req.file);
  const job = await transcodeQueue.add('menu-photo', { storeId, fileKey, itemId });
  return reply.code(202).send({ job_id: job.id });
});
// worker (별 프로세스): processMenuPhoto.ts — sharp → S3 → WS broadcast (commit 후)
```
**적용 위치:** `apps/api/src/workers/` (신규), `routes/menu.ts upload`, `routes/menu/import/*`, `services/aiOcr.ts`(P1.5).

---

## [AG-023] WS broadcast는 DB transaction commit 이후에만 ★ v3.3 신규
**증상:** TV가 `display:menu_item_updated` 수신 직후 GET snapshot → 옛 데이터 (read-after-write inconsistency). 또는 commit 실패 시 broadcast만 발사되어 클라이언트가 "유령 업데이트" 표시.
**원인:** Drizzle transaction 콜백 안에서 broadcast 호출, 또는 commit 직전에 broadcast.
**규칙:**
- broadcast는 **반드시 transaction commit 완료 후**에 호출.
- transaction 내부에서는 broadcast payload만 변수에 보관, await 끝난 다음 publish.
- worker 처리 시에는 commit + audit_log 작성 + broadcast 3단계를 strict 순서로.
**승격 사유:** M01 menu_item_updated, M02 order:status_changed, M03 display:event_push — 3개 모듈에서 동일 위험 ([AM01-006] 식별).
```typescript
// ❌ tx 안에서 broadcast
await db.transaction(async (tx) => {
  await tx.update(menuItems).set({...}).where(...);
  broadcast(storeId, 'display:menu_item_updated', { item });  // ← rollback 시 ghost
});

// ✅ commit 후
const updated = await db.transaction(async (tx) => {
  await tx.update(menuItems).set({...}).where(...);
  return tx.select().from(menuItems).where(...).then(r => r[0]);
});
broadcast(storeId, 'display:menu_item_updated', { item: updated });  // ← commit 확정 후
```
**적용 위치:** 모든 mutation 라우트 + worker. PR 리뷰 시 `broadcast` 호출이 `db.transaction` callback 내부에 있으면 자동 차단.

---

## [AG-024] 모든 시간/스케줄 로직은 `stores.timezone` 기준 — UTC 직접 비교 금지 ★ v3.3 신규
**증상:** LA 매장 11:00 PT lunch인데 TV가 18:00 UTC로 dinner. happy_hour 16:00 시작인데 매장에선 09:00에 발동. 30초 ready 타이머가 timezone shift 직전에 만료.
**원인:** `new Date().getHours()`, `Date.now()` 직접 비교, `setTimeout`을 매장 로컬 시간 변환 없이 사용.
**규칙:**
- **저장:** DB 컬럼은 항상 UTC (`timestamp with timezone` 또는 `timestamp` UTC 보장).
- **표시·비교:** caller는 **반드시 `stores.timezone`으로 변환** (`date-fns-tz toZonedTime` 또는 동등). 클라이언트도 동일.
- **cron/scheduler:** 매장 timezone 인지 — 매분 모든 매장 순회 시 각 매장 local 시간 계산.
- **wallclock 타이머:** setTimeout 절대 신뢰 금지 (deep sleep, DST). 명시적 `Date.now()` diff + abs timestamp 비교.
**승격 사유:** M01 daypart/LTO, M02 30s ready 만료, M03 happy_hour/recurrence, M05 cron scheduler — 4개 모듈 ([AM01-007] 식별).
```typescript
// ❌
const hour = new Date().getHours();          // 디바이스 로컬 / UTC 혼용
if (hour >= 16) startHappyHour();

// ✅
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';
const local = toZonedTime(new Date(), store.timezone);
if (local.getHours() >= 16) startHappyHour();

// ✅ cron 매장 순회
for (const store of activeStores) {
  const local = toZonedTime(now, store.timezone);
  if (shouldFireBreakfast(local, store.daypart_windows)) {
    broadcast(store.id, 'display:daypart_changed', { daypart: 'breakfast' });
  }
}
```
**적용 위치:** `services/scheduler.ts`, `routes/orders.ts` (만료 계산), `routes/events.ts` (recurrence), TV/Tablet client daypart 계산.

---

## [AG-025] TV 하드웨어는 SKU가 아닌 **카테고리**로 지원 ★ v3.4 신규
**증상:** "MECOOL KM2 Plus" 같은 단일 SKU에 의존 → 단종 / 재고 부족 / 리전별 가용성 차이 시 전체 deploy 라인이 멈춤. 매장이 직접 구매한 다른 Android TV 박스 / Google TV 기기에서 "지원 안 함" 으로 거절되는 운영 사고.

**원인:** 코드/문서/마케팅이 특정 SKU 이름을 박아둠. 검증 매트릭스가 "이 칩셋, 이 모델" 단위로만 존재.

**규칙 — 디지털 사이니지 CMS (Fugo, Scalefusion, PlaySignage 등) 표준 채택:**
- **지원 카테고리 (정본):** `Google TV / Android TV 12+, 2GB+ RAM, 16GB+ Storage, HDMI 1.4+, Wi-Fi 5+`
- **공식 지원 SKUs (2026-05, 카테고리 내 검증 대상):**
  - Walmart **Onn 4K Plus** Google TV — 북미 저가 floor
  - Walmart **Onn 4K Pro 2026** Google TV — 중급
  - Google **Google TV Streamer** — premium / reference
  - 확장 예정: 중국산 Android TV 박스 (필요 시 카테고리 충족 SKU 추가)
- 위 3종 중 하나가 단종/공급 중단되어도 같은 카테고리의 다른 SKU로 즉시 대체 가능해야 함.
- **금지:** README/마케팅/Onboarding 화면에 단일 SKU 모델명을 hardcode. 대신 "compatible with [카테고리]" + "tested SKUs: [후보 리스트]" 형식.
- **APK/빌드:** Android TV ABI는 `arm64-v8a` + `armeabi-v7a` 둘 다 포함 (구형 SKU 호환). minSdkVersion = 31 (Android 12).
- **런타임 detection:** 부팅 시 `Build.VERSION.SDK_INT` + `ActivityManager.MemoryInfo`로 카테고리 충족 여부 확인 → 미달 시 friendly error 화면. 특정 모델명 분기 금지.

**적용 위치:**
- `apps/tv/app.json` `android.minSdkVersion`, `targetSdkVersion`
- `apps/tv/src/App.tsx` 부팅 시 capability check
- `CLAUDE.md` Project Snapshot Hardware 줄 — 카테고리로 기술
- 모든 onboarding/마케팅 문구에서 SKU hardcode 제거
- 호환성 매트릭스 문서(`docs/TV-COMPATIBILITY.md` 신설 권장)에서 tested SKUs 관리

**승격 사유:** 북미 시장 조사 (2026-05) — Toast Order Ready Board가 Fire TV 단종 후 Intel mini-stick으로 강제 전환한 사례. 단일 SKU 의존 시 vendor 변경 = 전체 deploy 라인 stall. Fugo/Scalefusion/PlaySignage 모두 카테고리 인증 방식 채택.

```typescript
// ❌ SKU hardcode
if (Device.modelName !== 'MECOOL KM2 Plus') {
  Alert.alert('Unsupported device');
}

// ✅ 카테고리 capability check
import * as Device from 'expo-device';
const sdk = Platform.Version as number;
const totalMemMB = (Device.totalMemory ?? 0) / (1024 * 1024);
const meetsCategory =
  Platform.OS === 'android' && sdk >= 31 && totalMemMB >= 1800;
if (!meetsCategory) {
  return <UnsupportedDevice required="Android TV 12+ / 2GB+ RAM" />;
}
```

---

## v3 변경 사항 요약 (2026-05)

| AG | v2 | v3 | 이유 |
|----|----|----|------|
| AG-005 | PIN bcrypt 만 | + server-side 잠금 | client-side state 우회 가능 |
| AG-006 | dual token 만 | + revocation list | 탈취 refresh로 30일간 access 발급 가능 |
| AG-007 | try/catch | onError 콜백 | Speech.speak는 void, catch 도달 안 함 |
| AG-008 | 6자리 코드 만 | + 만료 + unique | 영구 유효 + 중복 가능 |
| AG-012 | JSON.stringify body | raw body + timingSafeEqual | 서명 mismatch + 타이밍 공격 |
| AG-013 | ~~BullMQ BSL~~ (오류) | Schema enum drift | BullMQ는 MIT. hook이 이미 enum drift용으로 사용 중 |
| AG-017 | — | 패키지 화이트리스트 (신규) | 미승인 라이브러리 차단 |
| AG-018 | — | 복합 unique (신규) | display_number 등 매장 식별자 충돌 방지 |
| AG-019 | — | Webhook DoS (신규) | rate limit 사각지대 보강 |
| AG-020 | — | Expo Web 호환성 (신규 v3.1) | M04 5건 (secure-store/zustand import.meta/reanimated-worklets/react dedup/route group) 통합 |
| AG-021 | — | List API 페이지네이션 (신규 v3.2) | GET /api/orders default limit=50 + ASC + status 필터 미적용 → active 주문이 응답에 안 들어옴 |
| AG-022 | — | Heavy work BullMQ 분리 (신규 v3.3) | M01 transcode·OCR·import + M02 TTS + M03 미디어 → 3 모듈 [AM01-005] anti-recorder 승격 |
| AG-023 | — | WS broadcast는 DB commit 후 (신규 v3.3) | M01 menu_item + M02 order:status + M03 event:push → 3 모듈 [AM01-006] |
| AG-024 | — | stores.timezone 기준 시간 로직 (신규 v3.3) | M01 daypart/LTO + M02 30s 만료 + M03 happy_hour + M05 cron → 4 모듈 [AM01-007] |
| AG-025 | — | TV 하드웨어 카테고리 지원 (신규 v3.4) | 북미 시장 조사 (2026-05). 단일 SKU 의존 시 vendor 단종/변경 = 전체 deploy stall. Fugo/Scalefusion/PlaySignage 카테고리 인증 표준 채택. |
