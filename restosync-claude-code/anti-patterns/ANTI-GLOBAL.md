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
