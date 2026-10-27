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
