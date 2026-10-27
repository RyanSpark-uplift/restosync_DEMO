# ANTI-M03.md — M03 오류 방지 패턴
> 오류 발생 즉시 기록. 형식: [M03-NNN] YYYY-MM-DD · 증상 · 원인 · 해결 · 코드

---

## [M03-001] 2026-05-21 · WS event를 ALLOWED list 등록 없이 emit
**증상:** scheduler.ts가 `broadcast(store_id, 'display:event_push', ev, …)` 를 호출하지만 broadcast.ts `WS_EVENTS` allowlist에 등록되어 있지 않아 TypeScript `WsEvent` union이 typo를 catch하지 못함. 'event_pushh'/'event:push' 같은 오타가 컴파일 통과 → 런타임에서 TV가 무음.

**원인:** `broadcast()` 시그니처가 `event: WsEvent | string` 으로 string fallback 허용 — 신규 이벤트 도입 시 allowlist 갱신을 잊으면 typing 보호망 무효화.

**해결:**
- M03 이벤트 추가 시 `apps/api/src/ws/broadcast.ts` `WS_EVENTS` 배열에 명시적으로 등록.
- 모든 라우트/서비스 emit 지점은 `WsEvent` 타입 알리어스로 좁혀서 호출.
- PR 리뷰: `broadcast(.*, '<...>'` literal 신규 시 allowlist diff에 같은 문자열이 포함되는지 자동 검사 후보.

**코드:**
```typescript
// ❌ allowlist 미등록 → typo 무방비
broadcast(store_id, 'display:event_pushh', ev);   // 컴파일 통과

// ✅ allowlist 우선 등록
export const WS_EVENTS = [
  // …
  'display:event_push',
  'display:event_clear',
] as const;
```

**AG 후보:** AG-003 (WS 이벤트명) 보강. 단일 모듈 재발이라 아직 AG 승격 보류.

---

## [M03-002] 2026-05-21 · type='alert'를 일반 ActiveEvent로 렌더링
**증상:** 긴급공지(type='alert') 이벤트가 happy_hour/promo와 동일한 시각 비중으로 표시됨 → 손님 시선 강제 효과 0, BR 의도(긴급도 강조) 누락.

**원인:** EventBoardScreen이 `currentEvent ? <ActiveEvent> : <IdleScreen>` 단일 분기. type 분기 없이 EVENT_TYPE_COLOR 매핑만으로 시각 차이를 표현하려 함 → 배경 dim+ticker 동일 레이아웃이라 사용자가 alert와 promo를 구분 못함.

**해결:**
- type='alert' 분기 추가: `<UrgentOverlay>` 컴포넌트로 별도 렌더.
- 빨강 배경 + Animated 펄싱 테두리(700ms ease in/out loop) + 큰 ⚠️ + 큰 title + body.
- IdleScreen / ActiveEvent / UrgentOverlay 3가지 분기로 명확화.

**코드:**
```typescript
// ❌ type 무시
{currentEvent ? <ActiveEvent event={currentEvent} /> : <IdleScreen />}

// ✅ type='alert' 별도 분기
{currentEvent
  ? (currentEvent.type === 'alert'
      ? <UrgentOverlay event={currentEvent} />
      : <ActiveEvent event={currentEvent} />)
  : <IdleScreen />}
```

**참조:** CLAUDE-M03 EventScreen 예시 코드(L65) — 이미 spec에 명시되어 있었음.

---

## [M03-003] 2026-05-21 · schema.ts 컬럼 추가 후 migration 미적용 — DB-hit 테스트 500
**증상:** `events.cta_url` 컬럼을 `schema.ts`에 추가하고 `migration 0022_events_cta_url.sql` 작성했지만 **개발 DB에 migration 적용 안 한 상태로 test 실행** → Drizzle이 `SELECT … cta_url FROM events`를 발사 → Postgres `column "cta_url" does not exist` → 500.

**원인:** schema.ts와 실제 DB 스키마 사이의 drift. drizzle-kit migrate를 commit 직전에 수동 실행하지 않으면 다음 세션에서 vitest 실행 시까지 발견되지 않음. 동일 환경에서 다른 모듈 작업하면 1건 fail이 회귀로 오해될 수 있음.

**해결:**
- 컬럼 추가 PR은 다음 3단계를 단일 commit으로 묶기:
  1. `apps/api/src/db/schema.ts` 변경
  2. `apps/api/src/db/migrations/NNNN_*.sql` + `meta/_journal.json` 추가
  3. (local) `pnpm drizzle-kit migrate` 적용 후 vitest 통과 확인 → commit
- Docker 미실행 환경에서는 commit log에 "DB-hit test N건은 migration NNNN 적용 후 통과" 명시 (Sprint G 패턴).
- CI에서는 vitest 전에 `drizzle-kit migrate` 자동 실행 후보.

**코드:**
```bash
# ❌ schema만 수정하고 commit
git add apps/api/src/db/schema.ts
git commit -m "feat: add cta_url"     # test 500 → 회귀 오해

# ✅ schema + migration + 적용 + test 통과 확인
git add apps/api/src/db/schema.ts apps/api/src/db/migrations/0022_events_cta_url.sql apps/api/src/db/migrations/meta/_journal.json
docker compose up -d postgres
pnpm --filter @restosync/api exec drizzle-kit migrate
pnpm --filter @restosync/api exec vitest run src/routes/events.test.ts    # 5/5 pass
git commit -m "feat: add cta_url (migration 0022)"
```

**AG 후보:** AG-013 (Schema enum drift) 의 컬럼 drift 확장 — 향후 동일 패턴 1건 더 발생 시 AG 승격 검토.
