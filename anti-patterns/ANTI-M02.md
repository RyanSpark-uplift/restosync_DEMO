# ANTI-M02.md — M02 오류 방지 패턴
> 오류 발생 즉시 기록. 형식: [M02-NNN] YYYY-MM-DD · 증상 · 원인 · 해결 · 코드

---

## [M02-001] TTS fallback 미작동
**날짜:** 2026-05-09 (v3 사전 등록)
**증상:** 음성 출력 안 되는 환경에서 expo-speech 실패 시 MP3 fallback이 재생되지 않음.
**원인:** `Speech.speak()`는 Promise를 반환하지 않음 (void). `try/await` 패턴의 `catch` 블록은 절대 도달하지 않음. AG-007 가이드 v2 코드 자체가 잘못됨.
**해결:** `onError` 콜백으로 fallback 호출. CLAUDE-M02.md "TTS + Fallback" 섹션 v3 참조.
**코드 (before):**
```typescript
async function announce(text: string) {
  try { await Speech.speak(text, { language: 'en-US' }); }
  catch { await playFallback(); } // 절대 도달 안 함
}
```
**코드 (after):**
```typescript
function announce(text: string) {
  Speech.speak(text, {
    language: 'en-US', rate: 0.9,
    onError: () => playFallback(),
  });
}
```

---

## [M02-002] 9번째 주문 시 1번 주문 데이터 손실
**날짜:** 2026-05-09 (v3 사전 등록)
**증상:** 9개 이상 주문이 들어오면 가장 오래된 주문이 화면에서 **사라지고**, store에서도 제거됨.
**원인:** Zustand `addOrder` 액션에서 `[...s.preparing, o].slice(-8)`. state 자체를 자르므로 데이터 손실.
**해결:** state에는 모두 보존, 화면 렌더링 단계에서만 `.slice(-8)`. AG-018 적용 (활성 주문 partial unique)로 중복 추가도 방지.
**코드 (before):**
```typescript
addOrder: (o) => set(s => ({ preparing: [...s.preparing, o].slice(-8) }))
```
**코드 (after):**
```typescript
addOrder: (o) => set(s => ({
  preparing: s.preparing.find(x => x.id === o.id) ? s.preparing : [...s.preparing, o],
}))
// 화면에서: const displayPreparing = preparing.slice(-8);
```

---

## [M02-003] `apps/tv` RN 소스 ≠ `/tv-view` 정적 HTML
**날짜:** 2026-05-15
**증상:** `apps/tv/src/screens/SingleVenuePickupScreen.tsx` 를 수정해도 `localhost:3000/tv-view` 화면에는 절대 반영되지 않음. "캐시 문제인가" 하고 시크릿창·DevTools Disable cache·Ctrl+F5 등 무관한 시간 낭비.
**원인:** 두 산출물이 별개. `/tv-view` 가 서빙하는 것은 `apps/api/public/tv-view.html` **수기 작성 단일 HTML** (E2E 테스트용 브라우저 viewer). 실제 Android TV는 `apps/tv` React Native 빌드. server.ts:126 주석에 명시.
**해결:** `/tv-view` 화면 수정은 **반드시** `apps/api/public/tv-view.html` 직접 편집. RN 소스 변경은 무관. 확인 한 줄:
```bash
curl -s http://localhost:3000/tv-view | grep rs-build  # 응답 헤더에 매번 새 빌드 보이면 정답
```
**구조:**
```
apps/tv/                       → React Native TV 앱 (실기 APK)
apps/api/public/tv-view.html  → 브라우저 viewer (E2E·데스크탑 검증용)
```

---

## [M02-004] 4열 그리드에서 카드 내용 오버랩 (overflow visible)
**날짜:** 2026-05-15
**증상:** `.order-card` 가 `min-height` 만 지정되고 `overflow` 미지정인데, 내용(큰 숫자 + 배지 + 시간)이 카드 박스보다 길어 아래 행 영역으로 visible overflow. "Almost ready" 같은 글자가 다음 카드 위에 겹쳐 보임.
**원인:** `display: flex; align-items: center` + 내용 높이 > `min-height` + `overflow: visible` (기본). flex centering이 컨테이너가 content 사이즈를 못 따라가는 상황을 만들면 위·아래로 흘러넘침. 좁은 4열 그리드에서는 가로 폭도 좁아 콘텐츠가 압축되어 더 심해짐.
**해결:** 카드와 내부 컨테이너 전부 `overflow: hidden` + 배지에 `max-width` + 텍스트에 `white-space: nowrap` 강제.
**코드 (after):**
```css
.order-card  { overflow: hidden; min-height: 100px; padding: 8px 12px; }
.card-left   { overflow: hidden; }
.badges      { overflow: hidden; flex-wrap: nowrap; }
.badge       { overflow: hidden; text-overflow: ellipsis; max-width: 80px; white-space: nowrap; }
.card-time, .card-eta { white-space: nowrap; }
```
**부가 교훈:** `clamp(80px, 11vh, 140px)` 같은 vh 기반 min-height는 작은 브라우저 창에서 너무 작아지므로 카드 내용 높이를 못 담음. TV 풀스크린 환경 외에는 고정 px 권장.

---

## [M02-005] 컨테이너 height 체인 끊김 → `overflow-y: auto` 미작동
**날짜:** 2026-05-15
**증상:** `.card-list { overflow-y: auto }` 인데 스크롤바 안 생기고 카드 2번째 행이 화면 아래로 잘림. body `overflow: hidden`이라 잘린 영역은 영영 못 봄.
**원인:** `tv-view.html` `<div id="screen">` 에 **CSS 룰 자체가 없음**. `display: block; height: auto` 기본값 → content-driven 무한 확장. 안의 `.pickup-root { height: 100% }` 가 부모(#screen)의 무한 높이를 100%로 잡아 결국 무한. `.card-list flex: 1; overflow-y: auto` 의 부모 높이가 안 잡혀서 스크롤 트리거 안 됨.
**해결:** `#screen` 을 `main` 의 정확한 박스에 고정 + flex column.
**코드 (after):**
```css
main { flex: 1; overflow: hidden; position: relative; min-height: 0; }
#screen { position: absolute; inset: 0; display: flex; flex-direction: column; }
.pickup-root { height: 100%; display: flex; flex-direction: column; }
.col { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.card-list { flex: 1; min-height: 0; overflow-y: auto; }
```
**핵심 원칙:** flex column 체인에서 **모든 중간 부모에 `min-height: 0`** 그리고 **루트는 `position: absolute; inset: 0`** 또는 명시적 height. 하나라도 빠지면 자식 `overflow: auto`는 트리거 안 됨.

---

## [M02-006] 8개 초과 시 정적 스크롤바는 TV UX 부적합 — 자동 페이지 순환 패턴
**날짜:** 2026-05-15
**증상:** 주방 TV는 멀리서 보는 화면이라 스크롤바를 마우스로 조작할 수 없음. "스크롤"의 실제 요구는 **자동 순환 표시**.
**원인:** spec의 "최대 8개 표시 + 초과 시 스크롤" 을 web `overflow-y: auto` 로 단순 구현하면 staff가 9번째 이후 주문을 영영 못 봄.
**해결 패턴 (tv-view.html):**
```javascript
const PAGE_SIZE = 8;             // 4-col × 2-row
const PAGE_INTERVAL_MS = 5000;   // 5초마다 다음 페이지
state.pages = { preparing: 0, expediting: 0, ready: 0 };

function pageSlice(bucketKey, sorted) {
  if (sorted.length <= PAGE_SIZE) { state.pages[bucketKey] = 0; return sorted; }
  const pageCount = Math.ceil(sorted.length / PAGE_SIZE);
  const idx = state.pages[bucketKey] % pageCount;
  return sorted.slice(idx * PAGE_SIZE, idx * PAGE_SIZE + PAGE_SIZE);
}

function startPageCycler() {   // idempotent
  if (pageCyclerId) return;
  pageCyclerId = setInterval(() => {
    for (const k of ['preparing','expediting','ready']) {
      const total = state.buckets[k].length;
      if (total > PAGE_SIZE) {
        state.pages[k] = (state.pages[k] + 1) % Math.ceil(total / PAGE_SIZE);
      }
    }
    renderPickup();
  }, PAGE_INTERVAL_MS);
}
```
**페이지 인디케이터:** 컬럼 헤더에 `1/3` 형태 배지 (페이지 2개 이상일 때만). 카드 데이터는 `state.buckets`에 모두 보존 — [M02-002] `.slice(-8)` 손실 패턴 재발 방지와 결합.

---

## [M02-007] TV Android 빌드 차단 — Windows MAX_PATH × pnpm 깊은 경로 ✅ RESOLVED 2026-05-23
**날짜:** 2026-05-23
**증상:** `pnpm exec expo run:android` 실행 시
- `CMake Warning: object file directory has 206 characters. The maximum full path to an object file is 250 characters (see CMAKE_OBJECT_PATH_MAX). Object file ... cannot be safely placed under this directory`
- 최종 실패: `ninja: error: manifest 'build.ninja' still dirty after 100 tries`
- `gradlew.bat app:assembleDebug ... exited with non-zero code: 1` (3m 25s 빌드 후)
**원인:** Windows 기본 MAX_PATH 260자 한계 + pnpm `.pnpm/expo-modules-core@1.12.26/node_modules/expo-modules-core/android/.cxx/Debug/<hash>/<abi>/CMakeFiles/...cpp.o` 깊은 격리 경로. repo 위치 자체가 `C:\Claude_WOrk_Space\Projects\Apple\Dev\restosync\` 56자 → node_modules 결합 시 native C++ 컴파일러가 ninja manifest를 안정적으로 만들지 못함.
**해결 후보:**
- ① repo를 `C:\r\restosync\` 같은 짧은 경로로 junction/이동 후 재빌드
- ② Windows 10/11 `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled=1` + gpedit "Enable Win32 long paths" — CMake/Ninja가 인지하는지 미검증
- ③ 실 KM2 Android TV USB 연결로 EAS dev-build 사용
- ④ `npmrc`에 `node-linker=hoisted` (pnpm) — 전 모노레포 영향
**회피 (단기):** SMOKE §7.4-7.5 TV 시연은 다음 세션에서 별도 toolchain fix 후 진행. 자동 회귀(vitest 321/321)는 TV 빌드 없이도 통과.
**연관:** [AM04-014] TV web @expo/cli ↔ metro hoisting — TV web/android 양쪽 차단 상태.

**2026-05-23 추가 검증:**
- ① junction `C:\r → C:\Claude_WOrk_Space\Projects\Apple\Dev\restosync\` 생성 후 `cd /c/r/apps/tv && expo run:android` 재시도 → 동일 실패. 이유: Expo autolinking이 `fs.realpath()`로 심볼릭 링크를 풀어 원본 절대경로 사용. CMake 경고에 여전히 `C:/Claude_WOrk_Space/...` 출현.
- ② Windows `LongPathsEnabled=1` 이미 활성 — 이 키는 Win32 MAX_PATH(260) 우회용이지 CMake의 `CMAKE_OBJECT_PATH_MAX=250` (하드코드)에는 무관.
- ③ CMake가 source 절대경로를 build dir에 mirror: `<long .cxx>/CMakeFiles/.../C_/Claude_WOrk_Space/Projects/Apple/Dev/restosync/node_modules/.pnpm/expo-modules-core@.../JSIUtils.cpp.o` → 합산 250+ → ninja manifest dirty loop.

**남은 실효성 있는 해결책 (사용자 결정 필요):**
- **A. 모노레포 물리적 이동:** `C:\Claude_WOrk_Space\Projects\Apple\Dev\restosync` → `C:\r\` (이동, junction 아님). repo path 56자 → 4자, 약 50자 단축 → 250자 한계 통과 기대. 영향: IDE/터미널 경로 일괄 변경.
- **B. pnpm `node-linker=hoisted`:** `.npmrc`에 추가 후 `pnpm install --force`. `.pnpm/<pkg>@<ver>/node_modules/<pkg>` 중첩 제거 → `node_modules/<pkg>`. 영향: 의존성 격리 약화, 1회 재설치(수 분).
- **C. 실 KM2 USB:** Windows에서 빌드하지 않고 EAS build 또는 실 디바이스 USB 연결.

세션 종료 시점 권장: A(가장 안전, 일회성) 또는 C(가장 빠름).

**해결 (2026-05-23):** **A 채택** — repo를 `C:\r\`로 물리 이동 (56자 → 4자, 약 50자 단축).

---

## [M02-008] # prefix on TV displays — drop for customer-facing surfaces
**날짜:** 2026-05-25
**증상:** Order number 디자인 가독성 저하. handoff_ready_only/README.md 명시: "Render as bare digits (e.g. `247`), no `#` prefix." 큰 글리프 환경에서 `#`은 시각적 노이즈만 추가.
**원인:** 초기 구현이 모든 surface에서 동일하게 `#${display_number}` 사용. operator-facing(Dashboard, engineer 패널, SMS, QR tracking)에선 `#`이 "주문 번호"임을 disambiguate 하지만, TV는 large-glyph context라 noise.
**해결 (정책 C2):** **TV-facing surface만 `#` 제거**, operator/customer-mobile surface는 유지.
- `apps/tv/src/screens/SingleVenuePickupScreen.tsx` (legacy emerald `#{display_number}`) — 제거 ✓
- `apps/tablet/app/tv.tsx` (Chromecast cast view) — 제거 ✓
- `apps/api/public/tv-view.html` — 이미 `numClean = num.replace(/^#/, '')` 적용 중 ✓
- `apps/tv/src/screens/pickup/ThemedPickup.tsx` — 처음부터 # 없이 렌더링 ✓
- `apps/tv/src/screens/pickup/readyOnlyLayouts/*` (신규 8 레이아웃) — 처음부터 # 없이 ✓
- **유지:** Dashboard (`apps/tablet/app/(tabs)/dashboard/index.tsx`), engineer 패널, scheduler SMS body, QR tracking page (`apps/api/src/routes/qr.ts`)

---

## [M02-009] Ready-only design-handoff layouts — font fail-loud + AbsoluteStage
**날짜:** 2026-05-25
**증상:** 8 layout (NowServing/BigList/DeparturesBoard/NamesCallout/Chalkboard/ScoreboardLed/BobaPop/StickerBoard) 디자인이 layout-별 고정 폰트(Caveat / Press Start 2P 등)에 강하게 의존. 폰트 silently missing 시 system fallback → D(NamesCallout) / G(BobaPop) 같은 cursive 디자인이 완전히 깨지는데 운영자가 인지 불가.
**원인:** 기존 `useThemeFonts.ts` (12-theme 시스템)는 graceful degrade — 폰트 누락 시 system-ui로 silent fallback. README의 "Don't substitute fonts. … surface a load error — don't fall back silently." 위반.
**해결:**
- 별도 `apps/tv/src/utils/readyOnlyFonts.ts` — fail-loud 정책. `useReadyOnlyFonts()` 가 `[loaded, error]` 반환 → 호출부가 error 시 빨간 `FontLoadError` 전체화면 렌더.
- 23종 themed 폰트(기존 fontAssets.ts)와 별도. 부팅 시간 영향 없음 (themed pickup은 그대로 23종, ready-only 진입 시 추가 10종 lazy load).
- ttf 10개를 `apps/tv/assets/fonts/`에 정적 번들 (총 33개, ~5MB).
- `AbsoluteStage` 컨테이너 (`_AbsoluteStage.tsx`): 1920×1080 absolute 박스 + `transform: scale(min(vw/1920, vh/1080))` + flex centering으로 letterbox. Android TV emulator 1080p (scale=1.0) / 4K cast (scale=2.0) / 브라우저 임의 viewport 모두 동일 비율 렌더링.
**핵심 원칙:** layout-specific font dependency가 있는 디자인은 **graceful degrade가 곧 silent corruption**. fail-loud + 운영자 알림이 안전.
- `pnpm install --force` 후 `apps/tv/android` 에서 `./gradlew.bat app:assembleDebug` 재실행.
- BUILD SUCCESSFUL **12m 29s**, exit 0, `app-debug.apk` 130MB 생성.
- CMake Warning / `OBJECT_PATH_MAX` / `ninja manifest dirty` **0건**.
- native build task 4회(externalNativeBuild/configureCMake) 정상 실행.
- 검증 로그: `C:/Users/hgpar/AppData/Local/Temp/claude/C--r/.../tasks/b4sklpdqr.output`
- 부가: 이동 직후 `packages/shared/src` + `packages/ui/src` 작업트리에서 누락 → `git checkout HEAD -- packages/shared/src packages/ui/src`로 복원. MOVE-TO-C-R.md 정리 스크립트가 `src/` 디렉토리를 잡아먹은 것으로 추정 (재발 시 cleanup glob 점검).
- 후속: KM2 USB 연결 후 `adb install app-debug.apk` + SMOKE §7.4-7.5 시연 진행.
