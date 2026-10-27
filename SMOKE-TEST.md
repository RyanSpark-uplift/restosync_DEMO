# SMOKE-TEST.md — RestoSync Sprint-단위 스모크 테스트 전략

> **목적:** "다 만들고 마지막에 테스트" 안티패턴 회피 + 자동 테스트 미작성 영역(태블릿 UI)의 회귀 방어.
> **빈도:** Sprint 끝날 때마다 5~15분.
> **자동화 수준:** 수동 클릭 + 콘솔 확인. Playwright/Detox는 P1.5 이후 도입 검토.
> v1 — 2026-05-19 (Sprint 4 commit 87646f1 시점)
> v2 — 2026-05-19 (Sprint 4 polish + Sprint 5 + M02 ttf 누적 시점, commit f8e5ad8)

---

## 1. 왜 "끝까지 미루기"는 위험한가

| 리스크 | 실제 영향 |
|--------|----------|
| **버그 누적** | Page B 4탭을 한 번도 열어보지 않았으면, 카테고리 fetch가 깨졌을 때 4개 탭 모두 영향. 시작점 추적 어려움. |
| **Web 호환성 사일런트 실패** | AG-020 7가지(secure-store / import.meta / reanimated / Alert.alert ...) — 콘솔 에러 한 줄 없이 백색 화면. 통합 후 발견하면 어느 commit이 원인인지 이등분 검색 필요. |
| **Context 손실** | 3주 후 버그 발견하면 "왜 이렇게 짰지?" 다시 읽어야 함. 지금 고치면 5분, 나중에 고치면 30분. |
| **회귀 무방어** | API는 138/138 자동테스트로 보호되지만, **태블릿은 자동 테스트가 0개**. 수동 확인 외엔 방법 없음. |

---

## 2. 권장: Sprint 단위 5분 스모크 테스트

풀 Playwright/Jest 안 만들어도 OK. 다음 4단계만 매 Sprint 끝에 실행:

```
1. docker compose up -d
2. pnpm api dev + pnpm tablet web (별도 터미널 2개)
3. 새 기능 한 번만 클릭해보기
4. 콘솔(F12) 빨간 에러 없으면 ✓
```

**투자 대비 효과:**
- 5분 × Sprint 수
- 약 80% 버그 사전 발견
- "한 commit으로 무엇이 깨졌나" 즉시 알 수 있음

---

## 3. 실행 절차 — 매 세션 공통

### 3.1 인프라 (최초 1회)

```powershell
cd C:\Claude_WOrk_Space\Projects\Apple\Dev\restosync

# PostgreSQL 16 + Redis 7 컨테이너
docker compose up -d

# DB 마이그레이션 + 시드 데이터 (최초 1회만)
pnpm --filter @restosync/api db:migrate
pnpm --filter @restosync/api db:seed
```

### 3.2 서버 실행 (매 세션)

```powershell
# 터미널 1 — API
pnpm --filter @restosync/api dev
#   → http://localhost:3000 listening
#   → Swagger: http://localhost:3000/docs

# 터미널 2 — 태블릿 (브라우저)
pnpm --filter @restosync/tablet web
#   → http://localhost:8081 자동 열림
```

### 3.3 로그인 (seed 기본값)

| 필드 | 값 |
|------|-----|
| API URL | `http://localhost:3000` |
| License Key | `RS-TEST-0001-AAAA:dev` (`:dev` 접미사 = Engineer Mode 활성) |
| PIN | `1234` |

---

## 4. Sprint 1~4 누적 스모크 체크리스트 (다음 세션 1회 실행)

### Phase A — 인프라 정상 (1분)

- [ ] `docker compose ps` → postgres + redis 모두 `Up (healthy)`
- [ ] `curl http://localhost:3000/health` → `{"ok":true}` 류 응답
- [ ] 태블릿 web `http://localhost:8081` 첫 화면 표시 (백색 화면 X)
- [ ] 브라우저 F12 Console → 빨간 에러 0개 (warning은 무시 가능)

### Phase B — 로그인 / 온보딩 (1분)

- [ ] License + PIN 입력 → 로그인 성공
- [ ] `/(tabs)/dashboard` 진입 — 주문 목록 화면 표시
- [ ] 좌측/상단 탭 네비게이션 동작 (Dashboard / Menus / Events / TVs / Analytics / Settings)

### Phase C — Sprint 3 Page A (메뉴 대시보드, 2분)

- [ ] `/menus` 진입 — 시드된 메뉴 5개가 3-col 그리드로 표시
- [ ] 좌측 사이드바: 카테고리 트리 + Daypart 필터 + 검색 박스 모두 보임
- [ ] 검색창에 한 글자 입력 → 그리드 즉시 필터링
- [ ] Daypart 칩 클릭 → 서버 재조회 (network 탭에 `?daypart=lunch` 요청)
- [ ] 메뉴 카드의 `AVAILABLE` 토글 클릭 → 즉시 `SOLD OUT` (회색+86)으로 변함
- [ ] 다시 클릭 → 복귀
- [ ] `+ Add Item` 버튼 → 모달 열림, 이름+가격 입력 후 생성 → 그리드 갱신
- [ ] WS 동작: 별도 브라우저 탭으로 같은 매장 열어두고, 한쪽에서 토글 → 다른 쪽도 자동 갱신

### Phase D — Sprint 4 Page B (Item Edit, 5분)

- [ ] 메뉴 카드 클릭 → `/menus/item/[id]` 진입
- [ ] 상단: 뒤로(<) + 아이템 이름 + Save 버튼
- [ ] 6탭 바 표시 (Basic / Schedule / Allergens / Display / Modifiers* / Ingredients*) — * 두 탭은 placeholder

**S4.1 Basic 탭**
- [ ] 언어 칩 5개 (English/한국어/Español/中文/日本語) — 클릭 시 입력란 전환
- [ ] 영어 이름 비우면 Save 버튼 비활성화 (BR-11)
- [ ] 가격 `15.99` 입력 → `Saved as 1599¢ (cents integer — BR-01)` 힌트 표시
- [ ] 카테고리 칩 선택 변경
- [ ] 어느 필드든 변경하면 우상단에 `● unsaved` 빨간 점

**S4.2 Schedule 탭**
- [ ] 6-Daypart 칩 (breakfast/lunch/snack/dinner/late/all) 토글 동작
- [ ] 매장 timezone + windows 박스 표시 (예: `America/Los_Angeles · lunch: 11:00–14:30`)
- [ ] LTO `+24h` 버튼 → 두 입력란이 ISO 형식으로 채워짐
- [ ] LTO `Clear` → 둘 다 비워짐
- [ ] `available_from` > `available_until`로 만들면 빨간 inline error

**S4.3 Allergens 탭**
- [ ] FDA 9 칩 토글 — 선택 시 빨간 배경 + 흰 텍스트
- [ ] Spice level 5-segment (none/mild/medium/hot/extreme) — 활성 셀에 불꽃 1~4개
- [ ] `Clear spice level` 링크 동작
- [ ] Calories 숫자 입력 (`540` 등)

**S4.4 Display 탭**
- [ ] `Show on TV` / `Featured` / `Hot / new` 3개 토글 스위치 (스위치 노브가 brand 색으로 슬라이드)
- [ ] Sort order `+` / `−` 스텝퍼 동작
- [ ] Kitchen name 입력 (대문자 자동)

**Save 동작**
- [ ] 어느 탭이든 1개 필드 변경 → Save 클릭 → Save 버튼이 spinner로 잠깐 변함 → 완료
- [ ] 뒤로 → 그리드에 변경사항이 반영됨 (예: 카테고리 변경했으면 카테고리 칩 그룹이 바뀜)
- [ ] 별도 탭에서 같은 매장 열어두고 Save하면 WS로 자동 갱신

**Modifiers / Ingredients 탭 (placeholder)**
- [ ] 클릭하면 `coming in S4.5 / S4.6` 안내 + 설명 표시 (에러 아님)

### Phase E — 회귀 (1분)

- [ ] Page B에서 뒤로 → 대시보드 → 검색·필터·86 토글 모두 여전히 동작
- [ ] 로그아웃 → 다시 로그인 → 토큰 갱신 정상
- [ ] 브라우저 F12 Console 전체 누적 에러 0~2개 이내 (network 404 / WS reconnect 빼고)

---

## 5. 발견 버그 처리 흐름

```
1. F12 Console → 첫 빨간 에러 1줄 복사
2. ANTI-M01.md 에서 비슷한 패턴 검색
3. 신규면 [AM01-NNN] 추가 (anti-recorder 자동 권장)
4. 코드 수정 → 같은 스모크 재실행 → 통과 확인
5. commit (지금 고치면 5분, 다음 Sprint 가서 고치면 30분)
```

**자주 마주칠 후보:**
- `SyntaxError: import.meta` → AG-020 §2 (CJS 강제)
- `Incompatible React versions` → AG-020 §3 (single-instance pinning)
- `UnavailabilityError ... SecureStore` → AG-020 §1 (web → localStorage 분기)
- 백색 화면 + 콘솔 0줄 → AG-020 §5 (route-group 모호성, `app/index.tsx` Redirect 확인)
- API 요청이 안 감 → `.env` 로딩 / CORS (AG-020 §7)

---

## 6. v2 추가 — Sprint 4 polish + Sprint 5 + M02 ttf 누적 (commit 5e131c3 ~ f8e5ad8)

### 6.0 사전 점검 (자동 — 이미 모두 통과)
- [x] `docker ps` → restosync-postgres + restosync-redis healthy
- [x] migration 0018까지 적용 (`menu_ingredients`, `menu_item_ingredients`, `menu_import_jobs`)
- [x] API tsc clean / Tablet tsc clean
- [x] vitest 272/272 pass (34 files)

### 6.1 Tab routing fix 확인 (10초)

- [ ] `/dashboard` 로그인 후 → 하단 탭바에 **6개만** 노출:
  Dashboard · Menu · Events · TVs · Analytics · Settings
- [ ] `menus/categories`, `menus/daypart`, `menus/imp...`, `menus/item/...` 같은 잘린 이름이 **노출되지 않음** (이전 버그)

### 6.2 Sprint 4 S4.5 Modifiers/Variants 탭 (3분)

- [ ] Menu 카드 클릭 → `/menus/item/[id]` 진입 → **Modifiers** 탭 클릭 (placeholder 아님)
- [ ] Variants 섹션
  - [ ] 빈 상태 안내 "No variants yet"
  - [ ] inline add: 이름 `Small` + `±$` `-1.00` 입력 → `+` 버튼 → 행 1개 추가
  - [ ] 두 번째 `Large` + `+2.00` 추가 → 행 2개
  - [ ] `★` 아이콘 클릭 → default 변경 (다른 행의 별 자동 해제)
  - [ ] 🗑 클릭 → 행 제거 (Web confirm dialog 뜸 - AM01-018)
- [ ] Modifier groups 섹션 (글로벌 그룹 존재 시)
  - [ ] 미부착 그룹 chip 표시
  - [ ] chip 클릭 → 강조 → "Attach" 버튼 노출 → 클릭 → attached 섹션으로 이동
  - [ ] 부착된 그룹 옆 × → detach
- [ ] BR-20 lock 시나리오 (sync_source≠restosync — 시드 없으면 skip)
- [ ] F12 Console 에러 0

### 6.3 Sprint 4 S4.6 Ingredients 탭 — Page B 6/6 (3분)

- [ ] **Ingredients** 탭 클릭 (placeholder 아님)
- [ ] 처음 진입 시 "No recipe lines yet" + "Add ingredient" 빈 chip 영역
- [ ] **Create new ingredient** 클릭 → mini form 열림 → 이름 `Apple` + unit `kg` (탭 클릭으로 cycle) → ✓ → 행이 자동으로 recipe에 추가됨
- [ ] 두 번째 ingredient `Cheese` (`g`) 추가
- [ ] 추가된 row에서 quantity `1.5` 입력 / unit chip 탭으로 cycle
- [ ] 우하단 **Save recipe** 버튼 활성화 (dirty)
- [ ] Save → 성공 → 버튼 사라짐
- [ ] 🗑 → web confirm → 행 삭제 → 다시 Save
- [ ] F12 Console 에러 0

### 6.4 Page C `/menus/categories` (2분)

- [ ] 우상단 **Categories** 버튼 → `/menus/categories` 진입
- [ ] 시드 카테고리 목록 표시 (드래그 X, ↑↓ 버튼만)
- [ ] 행에서:
  - [ ] emoji icon 입력 (예: `🍕`)
  - [ ] 언어 chip 클릭 → 입력란 lang 전환 → 빈칸이면 onBlur 후 변경 사항 무시 (영어 비우면 거부)
  - [ ] is_active eye 토글
  - [ ] ↑↓ 버튼으로 순서 변경 (서버에 reorder PATCH)
- [ ] 하단 dashed row: 새 카테고리 추가 (이름 `Test Cat` + emoji + ✓)
- [ ] 🗑 click — 빈 카테고리는 204, item이 attach 된 카테고리는 409 (서버 BR-14)
- [ ] 뒤로 → Menu 대시보드 사이드바에 새 카테고리 반영

### 6.5 Page D `/menus/daypart` (2분)

- [ ] 우상단 **Dayparts** 버튼 → `/menus/daypart` 진입
- [ ] 매장 timezone bar 표시
- [ ] 5개 daypart 행 (breakfast/lunch/snack/dinner/late) — `all`은 wildcard라서 제외
- [ ] `lunch` start `11:00` end `14:30` 입력
- [ ] 한 입력에 `25:99` 같은 잘못된 값 → red border + Save 비활성
- [ ] `snack` start `14:00` (lunch와 overlap) → 로컬은 통과 but Save → 서버 422 → 에러 표시
- [ ] 다시 정상 값으로 → Save → 성공
- [ ] × 버튼으로 daypart 클리어
- [ ] 뒤로 → Page B Schedule 탭에서 timezone hint가 동일하게 보임

### 6.6 Sprint 5 Page E Import wizard — 8 step (5분)

> 이 단계는 **터미널 2 (worker)** 필요: `pnpm --filter @restosync/api worker`. worker 없으면 Step 5에서 pending에서 멈춤.

- [ ] 우상단 **Import** → `/menus/import` 진입 → Stepper 8개 점 모두 표시
- [ ] **Step 1** "Download template" → 브라우저에 `restosync-menu-template.xlsx` 다운로드
- [ ] Excel/Numbers/LibreOffice로 열기 → `items` 시트에 sample row 1개 확인 → README 시트도 확인
- [ ] 한 줄 더 추가 (예: `name_en=Smoke Test Pizza, price_usd=11.99, dayparts=lunch, category_en=Pizza`) → 저장
- [ ] Next → **Step 2** instructional copy → Next
- [ ] **Step 3** "Choose file…" → 방금 저장한 xlsx 선택 → 자동 Step 4 (자동 전진 확인)
- [ ] **Step 4** photos placeholder → Next
- [ ] **Step 5** validating spinner → 2초 후 `preview_ready` 표시 → 자동 Step 6 전환
  - 만약 멈춰 있다면 worker 안 떠있을 가능성 — 터미널 2 확인
- [ ] **Step 6** 에러 0이면 "No row-level errors" + 통과 → Next
  - 에러 있으면 "Download errors.csv" 버튼 클릭 → CSV 다운로드
- [ ] **Step 7** preview rows 표시 + mode chip (lenient/strict) + "NOT reversible" 체크박스
  - [ ] 체크박스 미체크 상태에서 "Run import" 비활성 확인
  - [ ] 체크 → 활성
- [ ] **Step 8** Run → "Import completed" + `inserted: 2 · updated: 0 · skipped: 0`
- [ ] Done → `/menus`로 돌아옴 → 새 아이템(`Smoke Test Pizza`) 그리드에 보임
- [ ] **즉시 다시 Import** 시도 → 동일 `external_id` 안 줬으니 또 insert 됨 (BR-26 upsert는 external_id 있을 때만)
- [ ] **BR-33 동시 1 job**: 한 import 진행 중 다시 같은 매장에서 또 업로드 시도 → 409 (현실적으로 빠르므로 worker 없는 상태에서 테스트)

### 6.7 Engineer Mode 점검 (1분)

- [ ] Settings → Engineer 진입 (license key `:dev` suffix 있어야 활성)
- [ ] 로그/health/API base url 확인

### 6.8 회귀 (1분)

- [ ] 메뉴 대시보드: 검색 / Daypart 필터 / 86 토글 — 정상 동작
- [ ] Page B Save → WS broadcast로 다른 탭에 반영
- [ ] 로그아웃 → 다시 로그인 (refresh token 정상)
- [ ] F12 Console 누적 에러 2개 이하 (WS reconnect 메시지 제외)

---

## 7. v3 추가 — F.A/F.B (Featured rules) + G.A/G.B (Combos) + M03/A/B/C (Event) + F.C (TV 5-Zone) 누적 (commit 186d09c ~ 89d8684)

> 적용 commit: `186d09c` `24da71f` `3f04c6f` `2291868` `fd20fdb` `89d8684`
> 자동 회귀 결과: API 319/321 pass (events.test.ts + e2e.test.ts 2건은 migration 0022 미적용 시 일시 fail — [M03-003]). API + Tablet + TV tsc all clean.

### 7.0 사전 — migration 0022 적용 (필수, 1분)

```powershell
docker compose up -d postgres
pnpm --filter @restosync/api exec drizzle-kit migrate
# 적용 후 events DB-hit 테스트 2건도 통과 (321/321)
```

### 7.1 Page F Featured Rules `/menus/featured` (브라우저 3분)

- [ ] Header ⭐ Featured 버튼 클릭 → `/menus/featured` 진입
- [ ] **Current rotation preview** 카드: 매장 timezone + current_daypart 뱃지 + 매칭 rule 뱃지
- [ ] **Rule 토글**: chef_pick on/off → preview 60s 후 갱신 (또는 강제 새로고침)
- [ ] **LTO threshold**: 1d / 2d / 3d / 7d chip 변경 → Save → Dirty bar 사라짐
- [ ] **Interval picker**: 5 / 8 / 10 / 12s chip — 8이 default
- [ ] **Analytics rules (P2)** disabled 상태 확인
- [ ] **검증**: rule 중복 422 (서버), priority 0~1000, rotation_seconds=7 거부
- [ ] WS subscription: 다른 브라우저 탭에서 Save → 이 탭 preview 자동 invalidate (`['menu','featured']`)

### 7.2 Page G Combos `/menus/combos` (브라우저 4분)

- [ ] Header 📚 Combos 버튼 클릭 → `/menus/combos` 진입
- [ ] **Empty state** "No combos yet" + "New combo" 버튼 노출
- [ ] **New combo**: name_en, desc_en, Combo price USD (decimal→cents 변환 표시) — 라이브 BR-23 summary($합계/콤보가/savings/할인%)
- [ ] **Items picker**: 검색 → 가격 있는 menu_items만 노출 (sold_out·없는 가격 제외) → "Add" → qty stepper 1~99 + group_name(Main/Side/Drink/Dessert/Extra free-text) + substitutable 체크박스
- [ ] **BR-23 enforce**: 콤보가 > 정가합 → ⚠ exceeds 경고 + Save 비활성 (또는 422)
- [ ] **Dayparts** 6-value multi-select chip
- [ ] **Save** → 상단 카드 그리드에 새 콤보 표시 (savings + items count + dayparts + 86/Featured/Hidden 뱃지)
- [ ] **Edit** 카드 클릭 → 동일 editor에 기존 값 로드 → items 변경 → Save (전체 교체 1tx)
- [ ] **Sold out 토글**: 카드의 86 토글 → 즉시 반영 + WS broadcast
- [ ] **Delete**: editor의 Delete 버튼 → confirm 후 soft delete → 카드 사라짐
- [ ] **WS subscription**: 다른 탭 Save → 이 탭 list 자동 invalidate (`['menu','combos']`)
- [ ] **검증 422**: empty name / price 0 / empty items / dup item_id / invalid daypart / qty 0 / >20 items / unknown field (strict)

### 7.3 Events 탭 (M03 A+B+C) `/events` (브라우저 5분)

- [ ] `/events` 진입 → Active / All tab 토글
- [ ] **"+ New Event"** 버튼(brand) → EventEditorModal open
- [ ] **Mode A/B row**: Mode B 클릭 → inline "Coming Soon" notice 확인
- [ ] **Type chip**: happy_hour / live_event / lto / alert / promo 5값 (각 아이콘+색)
- [ ] **Title** 입력 + **Ticker text** multiline
- [ ] **Image picker**: "Pick image" → web file dialog → 이미지 선택 → 즉시 업로드 → preview 표시 → "Replace image" / X로 제거
- [ ] **CTA URL**: `https://reserve.example.com/test` 입력 → 유효성 OK / 잘못된 URL → 인라인 에러
- [ ] **Start at / End at**: Now / +1h / +24h / +7d chip 또는 직접 입력 → 잘못된 ISO → 인라인 에러 + 시작≥종료 검증
- [ ] **Save** → 상단 카드 그리드에 추가됨 (type 뱃지 + countdown + ticker 미리보기)
- [ ] **Switch active**: 카드 우측 Switch → 부모 카드 onPress와 분리(responder 잠금) → toggle만 발사 → PATCH active=true → WS `display:event_push` (TV-event 한정)
- [ ] **Edit**: 카드 영역 클릭(Switch 외) → editor에 기존 값 로드 → 변경 → Save
- [ ] **Active 토글 in edit**: edit 모드 active Switch off → Save → WS `display:event_clear`
- [ ] **Delete**: Delete 버튼 → web confirm → soft delete (deleted_at) 또는 hard delete (현재 hard) → 카드 사라짐
- [ ] **AG-024 reminder**: 입력은 UTC ISO — countdown은 device 로컬, TV는 매장 timezone 변환

### 7.4 TV — F.C 5-Zone + M03 cross-zone (Android 또는 RN-Web 시연 3분)

- [ ] TV menu 매장 페어링 → `/api/menu/featured/current?limit=8` 호출됨 (DevTools Network)
- [ ] **Zone A · Header**: store name + "MENU" + daypart chip(현재 daypart 대문자) + WS dot(녹색=connected) + clock
- [ ] **Zone B · FeaturedBanner**: ⭐ FEATURED 뱃지 + 이름 + 가격 + 좌측 이미지
  - [ ] 8초마다 cross-fade 700ms — 다음 아이템으로 회전 (Tablet에서 rotation_seconds=5로 바꾸면 5초)
  - [ ] pagination dot 우하단에 표시 (current item 강조)
  - [ ] sold_out 아이템은 풀에서 자동 제외
  - [ ] featuredItems 빈 배열일 때 "TODAY'S MENU" placeholder
- [ ] **Zone C · MenuGrid**: 4-col, category dot pager가 카테고리 헤더 안으로 이동
  - [ ] 카테고리 자동 회전 (slide_interval_sec)
  - [ ] sold_out 카드 SOLD OUT overlay + 가격 취소선
  - [ ] 🔥 hot / ⭐ featured 코너 플래그
- [ ] **Zone D · Ticker**: 현재 active event의 ticker_text가 좌→우 24s loop로 흐름
  - [ ] active event 없으면 Zone D 빈 (height만 유지, Zone C 60% 유지)
- [ ] **WS cross-zone**: Tablet에서 Page F rule 변경 → TV Zone B 자동 갱신 (`display:featured_config_changed`)
- [ ] **WS cross-zone**: Tablet에서 Event 생성 + active → TV Zone D ticker 갱신 (`display:event_push`)

### 7.5 TV — M03 Event Board screen (Android 또는 RN-Web 시연 2분)

- [ ] TV event 매장 페어링 → `EventBoardScreen` 표시
- [ ] **Empty**: 활성 이벤트 없음 → IdleScreen ("EVENT BOARD" + "No active events" + 시계)
- [ ] **Promo/HappyHour**: type=promo/happy_hour → Background image(dimmed) + 큰 title + Countdown(end_at 있을 때) + 하단 ticker scroll
- [ ] **QR (cta_url)**: Tablet에서 CTA URL 채운 이벤트 → TV 우하단 140px QR + "Scan to reserve" caption
- [ ] **UrgentOverlay (alert)**: Tablet에서 type=alert 이벤트 active → TV 빨강 전체 화면 + 펄싱 테두리(700ms loop) + ⚠️ 140px + 큰 title
- [ ] **WS event_push/clear**: Tablet active 토글 즉시 TV 전환 (3초 내)
- [ ] **WS reconnect (AG-002)**: API 재시작 → TV 3초 후 자동 재연결 → currentEvent 메모리 유지

### 7.6 회귀 (3분)

- [ ] **vitest 전체**: `pnpm --filter @restosync/api test` → 321/321 (migration 0022 적용 후)
  - migration 미적용 환경: 319/321 (events DB-hit 2건만 fail, 본 변경 무관 — [M03-003])
- [ ] **tsc 전체**: API + Tablet + TV `tsc --noEmit` → 모두 clean
- [ ] **Page A 회귀**: Sidebar(검색+daypart+카테고리) + 3-col grid + 86 토글 + WS 갱신 — 정상
- [ ] **Page B 회귀**: 6탭 (Basic/Schedule/Allergens/Display/Modifiers/Ingredients) 모두 진입 가능 + Save mutation
- [ ] **Page C 회귀**: 카테고리 reorder + 5-lang 토글
- [ ] **Page D 회귀**: Daypart HH:MM 편집 + Save (서버 422 겹침 검증)
- [ ] **Page E 회귀**: 8-step Import wizard end-to-end
- [ ] **logout/login** 정상 (refresh token)
- [ ] **F12 Console**: 누적 에러 ≤ 2 (RN-Web deprecation 외 [AM01-024])

### 7.7 발견된 잠재 이슈 (Sprint 진입 전 점검)

| 항목 | 영향도 | 조치 |
|------|--------|------|
| migration 0022가 SMOKE 환경에 적용 안 되면 events DB-hit 2건 fail | 낮음 | drizzle-kit migrate 1회 실행으로 해결, [M03-003] |
| TV App.tsx HTTP fetch가 auth 없이 호출 — production에서는 device_token 필요 | 중간 | 별도 sprint에서 TV-device JWT 패턴 정리 |
| FeaturedBanner / ZoneTicker의 비율 계산이 Dimensions.get('window') 시점 기반 — TV 회전 미지원 | 낮음 | 가로 고정 1920×1080 TV만 지원 — 의도된 제약 |

---

## 8. M02 ttf 번들 검증 (브라우저 X, Android 환경 필요)

- [ ] `apps/tv/assets/fonts/` 23개 ttf 확인 (`Get-ChildItem -Recurse | Measure-Object -Property Length -Sum`)
- [ ] Android emulator 또는 KM2 Plus 디바이스로 `pnpm --filter @restosync/tv start --reset-cache` + `pnpm --filter @restosync/tv android`
- [ ] 페어링 + theme_key 다른 매장 2~3개 확인 (디자인 검수)
- [ ] 누락 ttf 콘솔 경고 0건

---

---

## 9. 자동화 도입 시점 (Future)

| 시점 | 도입 대상 | 이유 |
|------|----------|------|
| 베타 매장 1곳 계약 후 | Playwright E2E (5~10 시나리오) | 첫 매장 라이브 전 reg 보호 |
| M03 Event Board 진입 전 | Tablet vitest unit (zustand store 위주) | UI 외부 로직 회귀 차단 |
| 다중 매장 확장 시 | Playwright matrix (3~5 매장 시뮬레이션) | 멀티테넌트 회귀 차단 |

자동화 도입은 **수동 스모크가 부담스러워질 때**까지 미룬다. 현재는 4탭 5분 = 충분히 가벼움.
