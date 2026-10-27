# ANTI-M04.md — M04 오류 방지 패턴
> 오류 발생 즉시 기록. 형식: [M04-NNN] YYYY-MM-DD · 증상 · 원인 · 해결 · 코드

---

## [M04-001] PIN 잠금 우회 (앱 재시작)
**날짜:** 2026-05-09 (v3 사전 등록)
**증상:** 3회 PIN 실패 시 30초 잠금이 적용되지만, 앱을 재시작하면 카운터가 리셋되어 brute-force 가능.
**원인:** `setFailCount` + `setLocked`는 React 컴포넌트 state. 메모리에만 존재, 영구 저장 없음.
**해결:** 잠금 판정은 server-side에서. Redis로 매장×사용자별 카운터/잠금 관리. 클라이언트는 표시만. AG-005 v3 참조.
**코드 (before):**
```typescript
if (failCount >= 2) setLocked(true); // 3회 실패 → 30초 잠금 (앱 재시작으로 우회)
```
**코드 (after):**
```typescript
// 클라이언트
if (res.status === 423) {
  const { retry_after_s } = await res.json();
  setLockedRemaining(retry_after_s); // UI 카운트다운만
}

// 서버 (apps/api/src/routes/auth.ts)
const lockKey = `auth:lock:${storeId}:${userId}`;
const lockTtl = await redis.ttl(lockKey);
if (lockTtl > 0) return reply.status(423).send({ error: 'LOCKED', retry_after_s: lockTtl });
// ... 실패 시 incr + 3회 도달 시 redis.set(lockKey, '1', 'EX', 30)
```
