# ANTI-M01.md — Menu Module Anti-Patterns
> **운영 규칙 (AG-011):** 모든 버그/PR 리뷰에서 발견된 안티패턴은 즉시 `[AM01-NNN]`으로 추가. 3개 이상 모듈에서 동일 패턴 → AG-NNN 승격 (anti-recorder agent 자동).
> 형식: `[AM01-NNN]` YYYY-MM-DD · 증상 · 원인 · 해결 · 코드 스니펫
> v1 (2026-05-17) — Sprint 0 시드 8건. 구현 코드 진입 전 반드시 로드 (harness 적용).

---

## [AM01-001] 가격을 float/decimal로 DB 저장
**증상:** 합산·할인 계산 시 0.01 단위 부동소수 오차 누적. POS sync 시 cents↔dollar 변환 충돌.
**원인:** `decimal('price', { precision: 10, scale: 2 })` 사용 — BR-01 위반.
**해결:** 모든 가격은 `integer cents`. Drizzle: `price_cents: integer('price_cents').notNull()`. Excel 입력만 달러(decimal) → 서버에서 `Math.round(d * 100)` 변환 (BR-25).
```typescript
// ❌ price: decimal('price', { precision: 10, scale: 2 })
// ✅ priceCents: integer('price_cents').notNull()
// ✅ Excel 변환: const cents = Math.round(parseFloat(row.price) * 100);
```

---

## [AM01-002] daypart 이름을 enum 외 자유 문자열로 저장
**증상:** TV에서 daypart 매칭 실패 → 메뉴 비표시. "morning"/"all_day"/"evening" 등 변형 값 출현.
**원인:** AG-013 enum 정본 미사용. `dayparts: jsonb` 자유 입력.
**해결:** **정본 6-value** `['breakfast','lunch','snack','dinner','late','all']` 외 입력 거부 (Zod). 컬럼은 `text[]` + Zod refine으로 enum 검증. 4값 유지 + `snack`/`late` additive 추가 (`closed`는 stores.business_hours로 분리).
```typescript
// ✅ shared/enums.ts에서 import
import { DAYPART, type Daypart } from '@restosync/shared/enums';
const DaypartArraySchema = z.array(z.enum(DAYPART));
// ❌ z.array(z.string())  ← 자유 입력 허용
// ❌ 'morning' / 'evening' / 'all_day' / 'closed' / 'late_night' 등 변형
```

---

## [AM01-003] external_id를 store 간 unique로 검증
**증상:** 매장 A가 `ITM-001` 사용 시 매장 B가 같은 ID 입력 → 422. 사용자 혼란.
**원인:** `UNIQUE(external_id)` 전역 제약 — BR-26 위반.
**해결:** **(store_id, external_id) 복합 unique** (AG-018). store 내만 unique, store 간 중복 허용.
```sql
-- ❌ CREATE UNIQUE INDEX ON menu_items (external_id);
-- ✅ CREATE UNIQUE INDEX ON menu_items (store_id, external_id) WHERE deleted_at IS NULL;
```

---

## [AM01-004] Import 트랜잭션을 별도로 분할
**증상:** 100건 import 중 50건 후 실패 → 부분적 데이터 남고 사용자가 다시 import 시 중복.
**원인:** 카테고리 1tx, items 1tx, modifiers 1tx 분리.
**해결:** **전체 1 transaction** (strict mode) **또는 row-level partial fail + 명시적 audit** (lenient mode). 둘 사이 중간은 금지 (BR-31).
```typescript
// ✅ strict: 전체 1 tx
await db.transaction(async (tx) => {
  for (const cat of categories) await tx.insert(menuCategories).values(cat);
  for (const it of items)       await tx.insert(menuItems).values(it);
  // 한 row라도 실패 → 전체 rollback
});
// ✅ lenient: 행별 시도 + errorReport 누적
const errors: ImportError[] = [];
for (const it of items) {
  try { await db.insert(menuItems).values(it); }
  catch (e) { errors.push({ row: it.row_number, reason: e.message }); }
}
```

---

## [AM01-005] 사진 트랜스코딩 중 메인 API thread 점유 → **AG-022 승격 (2026-05-17)**
**증상:** 5MB 사진 업로드 후 transcode 8초 동안 모든 API 요청 지연 → p99 폭증.
**원인:** `sharp().resize()` 를 라우트 핸들러 내에서 동기 await.
**해결:** **BullMQ worker로 분리.** 라우트는 S3 raw 업로드 + job enqueue만. Worker가 별도 프로세스에서 transcode → CDN URL 회신 → WS `display:menu_item_updated` broadcast.
**전역 규칙:** ANTI-GLOBAL.md [AG-022] 참조 — 200ms 이상 작업은 전부 BullMQ.
```typescript
// ❌ routes/menu.ts
app.post('/api/menu/upload', async (req) => {
  const img = await sharp(buffer).resize(1920).webp().toBuffer(); // ← blocking
});
// ✅ BullMQ queue
await transcodeQueue.add('menu-photo', { storeId, fileKey, itemId });
return reply.code(202).send({ status: 'queued', job_id });
```

---

## [AM01-006] WS broadcast 전 DB commit 누락 → **AG-023 승격 (2026-05-17)**
**증상:** TV가 `display:menu_item_updated` 수신 후 즉시 GET 호출 → 옛 데이터 반환 (read-after-write inconsistency).
**원인:** transaction commit 전에 broadcast 호출, 또는 commit과 broadcast 사이에 다른 read.
**해결:** **commit 후에만 broadcast.** Drizzle transaction 콜백 종료 후 호출. Snapshot endpoint도 ETag로 stale 감지.
**전역 규칙:** ANTI-GLOBAL.md [AG-023] 참조 — PR 리뷰에서 자동 차단.
```typescript
// ❌
await db.transaction(async (tx) => {
  await tx.update(menuItems).set(...).where(...);
  broadcast(storeId, 'display:menu_item_updated', { item });  // ← tx 안
});

// ✅
const updated = await db.transaction(async (tx) => {
  await tx.update(menuItems).set(...).where(...);
  return await tx.select().from(menuItems).where(...).then(r => r[0]);
});
broadcast(storeId, 'display:menu_item_updated', { item: updated }); // ← commit 후
```

---

## [AM01-007] TV 클라이언트 daypart 계산을 UTC로 → **AG-024 승격 (2026-05-17)**
**증상:** LA 매장에서 11:00 PT lunch 인데 TV가 18:00 UTC로 dinner 표시. 6시간 어긋남.
**원인:** `new Date().getHours()` 가 디바이스 로컬 / UTC 혼용. stores.timezone 무시.
**해결:** **모든 daypart 계산은 stores.timezone 기준.** `date-fns-tz` `toZonedTime(now, store.timezone)` 또는 서버 응답에 `current_daypart` 미리 포함.
**전역 규칙:** ANTI-GLOBAL.md [AG-024] 참조 — M02 30s 만료/M03 happy_hour/M05 cron 전체 적용.
```typescript
// ❌ const h = new Date().getHours();
// ✅
import { toZonedTime } from 'date-fns-tz';
const local = toZonedTime(new Date(), store.timezone); // 'America/Los_Angeles'
const daypart = resolveDaypart(local, store.daypart_windows);
```

---

## [AM01-008] 86 토글이 일반 PATCH endpoint와 같은 권한 검사
**증상:** kitchen 직원이 sold-out 토글 시도 → 403. 운영 마비.
**원인:** `PATCH /api/menu/items/:id` 와 sold-out 토글이 같은 RBAC 분기 (`role !== 'owner' && role !== 'manager'` 거부).
**해결:** **별도 fast-path endpoint** `PATCH /api/menu/items/:id/toggle-sold-out` 으로 분리. kitchen 권한 허용. price/name 수정과 완전 격리.
```typescript
// ✅ routes/menu.ts
app.patch('/api/menu/items/:id/toggle-sold-out', {
  preHandler: requireRole(['owner','manager','staff','kitchen']),  // kitchen 허용
}, async (req) => {
  await db.update(menuItems).set({ sold_out: req.body.sold_out, updated_at: new Date() })
    .where(and(eq(menuItems.id, id), eq(menuItems.store_id, storeId)));
  broadcast(storeId, 'display:menu_item_sold_out_toggled', { item_id: id, sold_out });
});
```

---

## [AM01-009] List endpoint status 기본 필터 누락 → active+sold_out 혼합
**증상 (2026-05-18 PR review BLOCK):** `GET /api/menu/items` 가 status 미지정 시 sold_out 항목 포함. AG-021 위반.
**원인:** Zod schema에 `status` default 없음. route는 status가 들어왔을 때만 sold_out 분기.
**해결:** Zod default `'active'`. admin/디버그 화면은 `?status=any` 명시 opt-in. menu categories도 `?is_active=` 옵션 + `limit/offset` 추가.
```typescript
// ✅ schemas/menu.ts
status: z.enum([...ITEM_STATUS, 'any']).default('active'),
// route: 'any' or 'archived' → no sold_out filter
```

---

## [AM01-010] PATCH/DELETE update WHERE에 deleted_at IS NULL 누락 → 소프트 삭제 부활
**증상 (2026-05-18 PR review WARN):** SELECT-then-UPDATE 패턴에서 SELECT에는 `isNull(deleted_at)` 있지만 UPDATE WHERE에는 누락. 두 쿼리 사이에 다른 요청이 soft-delete 하면 UPDATE가 deleted_at을 덮어쓰며 항목이 되살아남.
**원인:** "이미 SELECT로 확인했다"는 가정. race window 존재.
**해결:** **모든 UPDATE WHERE에 `isNull(deleted_at)` 동시 추가** + returning 결과가 없으면 404 반환. 단일 쿼리로 atomicity 보장.
```typescript
// ❌
const [updated] = await db.update(menu_items)
  .set(fields)
  .where(and(eq(menu_items.store_id, store_id), eq(menu_items.id, id)))
  .returning();

// ✅
const [updated] = await db.update(menu_items)
  .set(fields)
  .where(and(eq(menu_items.store_id, store_id), eq(menu_items.id, id), isNull(menu_items.deleted_at)))
  .returning();
if (!updated) return reply.status(404).send({ error: 'ITEM_NOT_FOUND' });
```

---

## [AM01-011] Audit log 실패를 console.error로만 swallow → ops alerting 무력화
**증상 (2026-05-18 PR review WARN):** `logAudit`가 DB outage 시 `console.error`만 호출. BR-06 append-only 계약 위반이 metric에 안 잡힘. DB 장애 + audit 누락 동시 발생 시 운영팀이 알 수 없음.
**원인:** "audit 실패가 요청을 죽이면 안 된다"는 contract만 구현, 가시성 메커니즘 부재.
**해결:** Fastify `req.log` 우선 사용(request_id 자동 컨텍스트) + Redis 카운터 `audit:fail:<store_id>` (24h TTL) + `/health/metrics`에 `rs_audit_write_failures_24h` 노출. "never throws" 계약은 유지.
```typescript
// ✅ audit.ts
export async function logAudit(entry: AuditEntry, logger?: FastifyBaseLogger): Promise<void> {
  try { await db.insert(menu_audit_log).values({...}); }
  catch (err) {
    (logger ?? console).error({ audit: true, store_id, ...context, err }, '[audit] write failed');
    redis.multi().incr(`audit:fail:${entry.store_id}`).expire(...).exec().catch(() => {});
  }
}
// route에서 await logAudit({...}, req.log) — request_id 자동 포함
```

---

## [AM01-012] text 컬럼 enum drift 위험 → CHECK 제약으로 차단
**증상 (2026-05-18 PR review FYI):** `menu_items.tax_policy/sync_source/spice_level/import_source`가 `text` 타입. Excel import나 workers/scripts가 Zod 우회 시 `'restosync_v2'`, `'mild_hot'` 같은 변형 값 DB 진입 가능 → TV 매칭 실패 + 분석 쿼리 깨짐.
**원인:** Drizzle pgEnum 사용 안 함 + DB-level enforcement 부재. Zod는 API route만 보호.
**해결:** **migration 0013에서 CHECK 제약 추가** (pgEnum 전환은 ALTER COLUMN TYPE 마이그레이션 위험 커서 보류). enum 확장 시 enums.ts + schema.ts + Zod + migration 동일 commit. AG-013 적용 범위에 포함.
```sql
ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_tax_policy_check
  CHECK (tax_policy IN ('exclusive','inclusive','exempt'));
-- spice_level / import_source 는 NULL 허용 (`col IS NULL OR col IN (...)`)
```
검증: `INSERT ... tax_policy = 'bogus_value'` → 22P02 `check constraint violation`.

---

## [AM01-013] Snapshot cache invalidate를 broadcast 뒤에 호출 → 옛 캐시 노출 race
**증상 (Sprint 2 S2.14~S2.16):** mutation route가 commit → broadcast → invalidateSnapshot 순으로 호출하면, TV가 broadcast 받자마자 GET /api/menu/snapshot 호출 시 아직 stale 캐시를 받아 옛 데이터 렌더. 다음 mutation까지 잠시 옛 사진/가격 노출.
**원인:** "invalidate는 안전망" 사고로 broadcast 뒤에 둠. 실제로는 TV가 broadcast 수신 즉시 fetch → cache HIT (stale) → invalidate 실행 (이미 늦음).
**해결:** **strict 순서** `commit → audit → invalidate (await) → broadcast`. invalidate가 await 완료된 다음에만 broadcast 호출. worker도 동일.
```typescript
// ❌
await tx.update(...).commit();
broadcast(storeId, 'display:menu_item_updated', { item });   // TV가 fetch → stale HIT
await invalidateSnapshot(storeId);                            // 이제 invalidate (too late)

// ✅
await tx.update(...).commit();
await logAudit({...});
await invalidateSnapshot(storeId);                            // stale 제거 먼저
broadcast(storeId, 'display:menu_item_updated', { item });   // TV가 fetch → MISS → fresh build
```
**적용 위치:** `routes/menu.ts`(6곳), `routes/menuCategories.ts`(4곳), `routes/menuDayparts.ts`(1곳), `services/scheduler.ts`(daypart cron), `workers/imageTranscodeWorker.ts`. 총 12 호출 사이트. PR 리뷰에서 `invalidateSnapshot` ↔ `broadcast` 호출 순서 점검 (lint rule 후속 검토).

---

## [AM01-014] WS broadcast filter가 TV-only — Tablet 간 실시간 갱신 불가
**증상 (2026-05-19 SMOKE Phase C):** 같은 매장에서 Tablet 두 탭을 띄우고 한쪽에서 86 토글하면 다른 쪽이 자동 갱신 안 됨. `useMenuWsSubscription`은 정상 invalidate 로직을 가졌지만 이벤트 자체가 도달하지 않음.
**원인:** menu 관련 mutation route 10곳(menu.ts 5 + menuCategories.ts 4 + menuDayparts.ts 1) 모두 `broadcast(... (c) => c.device_type === 'tv' && c.role === 'menu')` 필터 사용. Tablet 클라이언트는 매장 room에 join은 되지만 모든 menu 이벤트에서 걸러져서 수신 0건.
**해결:** menu 이벤트는 **TV menu role + 모든 Tablet** 양쪽으로 broadcast. PRD §6 표는 `Server→TV` 만 명시했지만 Sprint 3 Page A 구현이 Tablet 멀티 인스턴스 동기화를 요구 → spec 보강. order/pickup 이벤트는 그대로 TV-only 유지.
```typescript
// ❌ TV only — Tablet은 영원히 수신 못함
broadcast(store_id, 'display:menu_item_sold_out_toggled', payload,
  (c) => c.device_type === 'tv' && c.role === 'menu');

// ✅ TV menu role + 모든 Tablet
broadcast(store_id, 'display:menu_item_sold_out_toggled', payload,
  (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));
```
**적용 위치:** `routes/menu.ts`(5 broadcast), `routes/menuCategories.ts`(4), `routes/menuDayparts.ts`(1). 향후 신규 `display:menu_*` / `display:category_*` / `display:daypart_*` 이벤트도 동일 패턴 강제. 후속 PR review hook이 menu 관련 broadcast에서 Tablet 제외 시 경고.

---

## [AM01-015] Daypart 필터 sidebar에 'all' wildcard 칩 중복 노출
**증상 (2026-05-19 SMOKE Phase C):** Tablet `/menus` 좌측 sidebar Daypart 영역에 `All` 칩이 두 번 표시됨. 두 번째 'all'은 선택해도 첫 번째와 동일 결과.
**원인:** `MenuSidebar.tsx`가 명시적 "All" 칩(filter 해제 = `setDaypart(null)`) **위에** `DAYPART.map(...)` 전체를 렌더. DAYPART enum에는 `'all'` wildcard 값(BR-11, Excel default)이 포함되어 있어 의미는 다르지만 UI에선 동일 라벨로 충돌.
**해결:** filter 칩 렌더 시 `DAYPART.filter((d) => d !== 'all')` 로 wildcard 제외. wildcard `'all'`은 **데이터 저장용**(Excel/seed default), filter UI에서는 "All" = filter 해제만 노출.
```tsx
// ❌
{DAYPART.map((d) => <Chip label={d} ... />)}

// ✅
{DAYPART.filter((d) => d !== 'all').map((d) => <Chip label={d} ... />)}
```
**적용 위치:** `apps/tablet/src/components/menu/MenuSidebar.tsx`. 추후 Featured rules / LTO 윈도우 UI 등 daypart 칩 사용 시 동일 패턴.

---

## [AM01-016] Controlled TextInput을 매 render마다 reformat → 사용자 입력 왜곡
**증상 (2026-05-19 SMOKE Phase D Basic):** Price 입력란에서 `15.99`를 치면 `15.18`로 변형되고, 커서가 매 입력마다 맨 앞으로 튀어서 사용자가 다시 위치를 잡아야 함.
**원인:** `BasicTab.tsx`가 `priceStr = (price_cents / 100).toFixed(2)` 를 매 render마다 계산해서 TextInput value로 그대로 흘려보냄. 사용자가 "1.005" 같은 중간 상태를 치면 onChange가 즉시 cents로 반올림 → 다음 render에서 raw text가 정규화된 string으로 덮임 → cursor 손실 + 의도와 다른 값.
**해결:** **입력 중에는 raw text를 local state로 유지**. cents는 onChange에서 parse해서 parent로 흘림. 외부 source가 바뀐 경우(load, reset)에만 useEffect+ref로 display 동기화.
```tsx
// ❌ 매 render reformat
const priceStr = value.price_cents != null
  ? (value.price_cents / 100).toFixed(2) : '';
<TextInput value={priceStr} onChangeText={onPriceChange} />

// ✅ raw text local state + 외부 변경만 동기화
const [priceText, setPriceText] = useState(
  value.price_cents != null ? (value.price_cents / 100).toFixed(2) : '',
);
const lastCentsRef = useRef<number | null>(value.price_cents);
useEffect(() => {
  if (value.price_cents !== lastCentsRef.current) {
    setPriceText(value.price_cents != null ? (value.price_cents / 100).toFixed(2) : '');
    lastCentsRef.current = value.price_cents;
  }
}, [value.price_cents]);
const onPriceChange = (txt: string) => {
  setPriceText(txt);  // raw text 유지
  // parse → parent.onChange + lastCentsRef 갱신
};
```
**적용 위치:** `BasicTab.tsx` Price (수정 완료). 후속: variant priceDelta, modifier option priceDelta, combo price 등 cents↔dollar 변환이 있는 모든 input. **일반 규칙:** controlled input의 source가 변환된 값(cents, normalized date 등)이면 입력 중 raw text local state 필수.

---

## [AM01-017] WS invalidate가 list cache만 처리 — single-item cache stale
**증상 (2026-05-19 SMOKE Phase E):** 별도 탭에서 Page B(`/menus/item/[id]`) 열어둔 상태로 첫 탭에서 Save → 두 번째 탭 자동 갱신 안 됨. List 그리드는 정상 갱신.
**원인:** `useMenuWsSubscription`이 `invalidateQueries({ queryKey: ['menu','items'] })` (복수)만 호출. Page B는 단일 item을 `['menu','item',id]` (단수) key로 캐싱 → 별개 cache → invalidate 안 됨 → stale 상태.
**해결:** WS event 수신 시 list + single-item cache **둘 다** invalidate. TanStack partial key는 모든 `id` 매칭.
```ts
// ❌ list 캐시만
qc.invalidateQueries({ queryKey: ['menu', 'items'] });

// ✅ list + 단일 item 둘 다
qc.invalidateQueries({ queryKey: ['menu', 'items'] });
qc.invalidateQueries({ queryKey: ['menu', 'item'] });  // partial — 모든 id 매칭
```
**일반 규칙:** TanStack Query에서 list/detail cache 분리 시, mutation 이벤트는 **양쪽 모두 invalidate** 필요. 단방향(list만 또는 detail만) 처리는 stale 위험.

---

## [AM01-018] Logout/confirm 등에 `Alert.alert` 사용 → web에서 silent no-op (AG-020 §6 위반)
**증상 (2026-05-19 SMOKE Phase E):** Settings → Logout 버튼 클릭 시 아무 반응 없음. 모바일에서는 confirm dialog 정상.
**원인:** `Alert.alert(...)`은 React Native Web에서 no-op. AG-020 §6에 명시되어 있지만 Sprint 3에서 Settings 구현 시 인지 못함.
**해결:** `Platform.OS === 'web'` 분기로 `window.confirm()` 사용. Native는 기존 Alert.alert 유지.
```ts
// ❌ web silent
Alert.alert('Logout', '...', [..., { onPress: clearAuth }]);

// ✅ web/native 분기
if (Platform.OS === 'web') {
  if (globalThis.confirm('Log out of this device?')) clearAuth();
  return;
}
Alert.alert('Logout', '...', [..., { onPress: clearAuth }]);
```
**점검 대상:** 코드베이스 전체 `Alert.alert` grep — Settings 외에도 venueGroup join error, PIN 입력 검증 등 다수 존재. 후속 Sprint에서 일괄 마이그레이션 필요.

---

## [AM01-019] list endpoint ORDER BY 미정렬 tie-break → UPDATE 후 정렬 swap
**증상 (2026-05-20 SMOKE v2 §6.8):** Page A 메뉴 그리드에서 86 토글 → 카드가 다른 위치로 이동 (예: 1열 2행 → 2열 2행). BR-13 sort_order는 동일.
**원인:** `GET /api/menu/items`의 `ORDER BY sort_order, created_at` — seed가 같은 트랜잭션에 들어가서 두 컬럼 모두 동등한 row 존재. PostgreSQL ORDER BY는 동등값에서 unstable. PATCH sold_out이 발사한 UPDATE 후 index access 순서가 바뀌어 refetch 시 다른 순서 반환.
**해결:** ORDER BY 마지막에 `id` tiebreaker 추가 → deterministic. 같은 안티패턴이 menu_categories / menu_variants / menu_modifier_groups / menu_modifier_options / menu_item_modifier_groups / menu_item_ingredients / menu_ingredients 7개에도 존재 — 일괄 fix.
```ts
// ❌ unstable tie-break
.orderBy(menu_items.sort_order, menu_items.created_at)

// ✅ deterministic
.orderBy(menu_items.sort_order, menu_items.created_at, menu_items.id)
```
**점검 대상:** 신규 list endpoint 작성 시 마지막 column에 항상 PK(id) 추가. AG-021 보강 후보.

---

## [AM01-020] Expo Router 라우트 폴더에 `_layout.tsx` 누락 → sub-route가 별도 탭으로 노출 / route name이 `<folder>/index`로 등록
**증상 (2026-05-20 SMOKE v2 §6.1):** 하단 탭바에 `menus/imp...`, `menus/day...`, `menus/cate...` 같은 잘린 이름이 정규 6개 탭과 함께 노출. 콘솔에 `[Layout children]: No route named "dashboard"/"events"/"tvs" exists in nested children: ['analytics', 'dashboard/index', 'events/index', 'menus', 'settings', 'tvs/index']`.
**원인:** Expo Router는 `(tabs)/<folder>/`에 `_layout.tsx`가 없으면 폴더를 펼쳐서 각 sub-route를 부모 layer에 노출. 또한 폴더 자체의 route name이 `<folder>`가 아닌 `<folder>/index`로 등록되어 `(tabs)/_layout.tsx`의 `<Tabs.Screen name="<folder>">` 매핑이 실패. settings/analytics는 이미 `_layout.tsx` 있어서 정상이었지만 menus/dashboard/events/tvs는 누락.
**해결:** 모든 라우트 폴더에 `_layout.tsx` 추가 (`<Stack screenOptions={{ headerShown: false }} />`만 있어도 충분). settings 패턴 그대로 일반화.
```tsx
// apps/tablet/app/(tabs)/<folder>/_layout.tsx
export default function FolderStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```
**점검 대상:** `(tabs)/` 아래 신규 폴더 추가 시 즉시 `_layout.tsx` 동시 생성. PR template에 체크리스트 추가 권장.

---

## [AM01-021] `.test.tsx` 파일을 `app/` 트리에 두면 Expo Router가 라우트로 등록 → "missing required default export" 에러
**증상 (2026-05-20 SMOKE v2 §6.2):** 콘솔에 `./(tabs)/menus/categories/index.test.tsx is missing the required default export`. 3개 페이지(categories/daypart/import) 모두 동일. routing tree 전체가 망가져 dashboard/events/tvs 라우트까지 영향.
**원인:** Expo Router는 `app/` 트리 내 모든 `.tsx`/`.jsx` 파일을 라우트로 인식 (`.test.tsx`도 포함). TDD shim 파일은 default export 없으므로 라우트로 등록되면 에러. 콘솔 에러로 인해 React 렌더링 부분 실패 → stale 컴포넌트(Settings Display 등)가 같은 viewport에 함께 보이는 visual artifact 발생.
**해결:** `app/` 트리에서 `.test.tsx` 즉시 제거. TDD shim은 `src/` 트리(컴포넌트가 있는 곳)에만 작성. `app/` 트리는 pre-write-tdd-check.sh 면제.
```
# ❌
apps/tablet/app/(tabs)/menus/categories/index.test.tsx

# ✅ (저장소에 두지 말 것; TDD hook은 src/만 강제)
apps/tablet/src/components/menu/.../FooBar.test.tsx
```
**점검 대상:** 신규 라우트 추가 시 같은 폴더에 `*.test.tsx` 작성 금지. CI에서 `find app/ -name '*.test.tsx'` grep으로 차단 가능.

---

## [AM01-022] RN `<View>` children에 빈 문자열이 들어가면 "Unexpected text node" → 화면 깨짐
**증상 (2026-05-20 SMOKE v2 §6.5):** Daypart 페이지 진입 시 콘솔 `Unexpected text node: . A text node cannot be a child of a <View>` + 화면이 부분적으로 렌더 실패 → 다른 화면 컴포넌트가 stale state로 함께 보임.
**원인:** `{(start || end) && (<TouchableOpacity>...)}` 패턴에서 `start = ''`, `end = ''` 일 때 `('' || '')` → `''` → `'' && (...)` → `''` 반환 → JSX가 빈 문자열을 children으로 렌더 시도. RN/RN-Web에서 `<View>`의 직접 children에 string 노드는 금지.
**해결:** Boolean 변환으로 falsy 우회.
```tsx
// ❌ '' 가 children으로 들어감
{(start || end) && (<TouchableOpacity>...</TouchableOpacity>)}

// ✅ Boolean 래핑
{Boolean(start || end) && (<TouchableOpacity>...</TouchableOpacity>)}

// ✅ 또는 .length 명시
{(start.length > 0 || end.length > 0) && (...)}
```
**점검 대상:** `&& (<...>)` 조건부 렌더 좌변에 string-typed 값 있는지 확인. `style={[..., (a || b) && {...}]}` 형식은 안전 (style 배열은 falsy 무시).

---

## [AM01-023] React Query refetch가 useAuthStore hydrate 전에 발사 → 첫 페이지 진입 시 401 노이즈
**증상 (2026-05-20 SMOKE v2 §6.6/§6.8):** 페이지 reload 직후 콘솔에 `GET /api/menu/dayparts 401` 및 `GET /api/orders?status=... 401`. 화면 동작은 정상 (token hydrate 후 자동 정상화).
**원인:** TanStack Query는 페이지 mount 즉시 fetch 발사. `useAuthStore`의 `hydrate()`는 SecureStore/localStorage에서 비동기로 token 복원 — race로 fetch가 먼저 떠서 `token=null` 상태로 요청 → 서버 401. `client.ts`의 auto-clearAuth는 *token이 있는데도* 401일 때만 동작하므로 token=null 케이스는 throw만 함 (사용자 화면은 정상).
**해결:** 우선순위 낮음. 콘솔 노이즈만 발생, 동작 정상. 필요 시 query에 `enabled: useAuthStore((s) => s.hydrated && !!s.token)` gating 추가 또는 root `_layout.tsx`에서 hydrate 완료까지 Slot 렌더 보류.
**점검 대상:** auth 필요한 모든 React Query 호출. P1.5 polish 영역.

---

## [AM01-024] RN-Web 외부 라이브러리 발 deprecation 노이즈 (`shadow*`, `props.pointerEvents`)
**증상 (2026-05-20 SMOKE v2):** 콘솔에 `"shadow*" style props are deprecated. Use "boxShadow"` / `props.pointerEvents is deprecated. Use style.pointerEvents`. UI 동작 영향 0.
**원인:** RN 0.74 / react-native-web 0.21 deprecation. `@expo/vector-icons`, `@gorhom/bottom-sheet` 같은 외부 라이브러리가 아직 마이그레이션 안 됨. 우리 코드 책임 아님.
**해결:** 외부 라이브러리 업데이트 대기. 영향 0이므로 별도 fix 불필요. ANTI 기록 목적.
**점검 대상:** 우리 코드에서 `shadowColor/shadowOffset/...` 또는 `pointerEvents` prop 직접 사용 시 신규 패턴으로 마이그레이션. grep 점검 권장.

---

## [AM01-025] 중첩 `<Text>` color override가 RN-Web에서 실패 — inner 색상이 outer 흰색으로 덮임
**증상 (2026-05-21 SMOKE §7.2):** Page G Combos에서 BR-23 위반 시 표시되는 `⚠ combo price exceeds items total` 문구가 흰색으로 보여 안 읽힘.
**원인:** `<Text style={summaryLine /* color #F0F2FF white */}><Text style={errorText /* color #d32 red */}>...</Text></Text>` 구조. 네이티브 RN은 inner Text가 outer Text의 color를 override 하지만, RN-Web (react-native-web 0.21)에서는 outer Text의 명시적 color가 inner span에도 cascade되어 inner override가 일부 케이스에서 무시됨. 특히 outer Text가 conditional fragment를 child로 갖는 경우.
**해결:** error/ok 색상이 필요한 nested Text는 outer Text 래퍼를 제거하고 sibling으로 분리. nested Text는 동일 색상일 때만 사용.
```tsx
// ❌ outer color (white) cascades; inner red ignored on web
<Text style={summaryLine}>
  {violates ? <Text style={errorText}>⚠ ...</Text> : <Text style={ok}>OK</Text>}
</Text>
// ✅ split into siblings — no inheritance conflict
{violates ? <Text style={errorText}>⚠ ...</Text> : <Text style={ok}>OK</Text>}
```
**점검 대상:** 다른 화면의 inline error/warning 패턴 (status badge, validation hint). grep `<Text[^>]*>\s*<Text` 점검.

---

## [AM01-026] Expo Web TextInput이 4-byte emoji 입력을 ASCII `?`로 fallback → DB에 `??` 저장
**증상 (2026-05-21 SMOKE §7.1):** Page A 메뉴 사이드바에 `?? Sides`, `??Chicken` 로 카테고리 icon이 표시. DB hex 확인 시 `icon = 0x3f3f` (literal `??`), name jsonb의 ko/ja도 mojibake (`\xef\xbf\xbd` 반복).
**원인:** Expo Web (react-native-web) TextInput이 Windows IME/composition 환경에서 4-byte UTF-8 chars (emoji surrogate pair, 한글 jamo composition)를 `?`로 강등 — RN-Web 알려진 제약. 입력은 정상 보이지만 onChangeText에서 이미 ASCII로 떨어진 값이 전달됨.
**해결:** 입출력 양쪽에 sanitization 적용.
- **표시**: emoji-필드 렌더 전 `[...icon].some(ch => ch.codePointAt(0)! > 127)` 가드로 pure-ASCII fallback은 no-icon 처리 (literal `??` 차단).
- **입력**: TextInput onBlur/submit 시 동일 검사로 pure-ASCII는 `null` 저장 — 잘못된 값이 DB에 들어가지 않도록.
- **데이터 정리**: `UPDATE menu_categories SET icon = NULL WHERE icon ~ '^[[:ascii:]]+$';`
```tsx
const hasEmoji = !!icon && [...icon].some((ch) => ch.codePointAt(0)! > 127);
{hasEmoji ? <Text>{icon}</Text> : <Spacer />}
```
**점검 대상:** emoji 필드 전체 — `menu_categories.icon`, `events.icon` (있다면), 향후 chip/emoji picker. P1.5에서 web 전용 emoji-picker 라이브러리(`emoji-picker-react` 등) 도입 검토.

---

## 신규 항목 자동 추가 규칙

- 발견 시점에 즉시 `[AM01-NNN]` 추가 — Sprint 종료 전 일괄 정리 금지
- 코드 수정 PR에 `Related: [AM01-NNN]` 라인 포함
- 같은 패턴이 M02/M03/M04/M05에서도 발견되면 anti-recorder agent가 자동으로 AG-NNN 승격 제안
