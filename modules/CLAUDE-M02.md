# CLAUDE-M02.md — TV② Order Pickup Display
> **세션 로드 순서:** CLAUDE.md → ANTI-GLOBAL.md → ANTI-M02.md → 이 파일
> v2 | Sonnet 4.6 UX 감사 반영 — Loading/Empty 상태, 8개 한도, 애니메이션 명세 추가

---

## 목표
WS 전체 흐름 검증에 최적. M05 완료 후 두 번째로 구현.

## 확정 스택
React Native **0.83.6** · Expo SDK **55** · React **19.2** · Zustand · expo-speech (TTS) · expo-keep-awake · expo-font · react-native-svg · react-native-qrcode-svg

> **v3 (2026-05-31)**: RN 0.74 → 0.83 / Expo 51 → 55 / React 18.2 → 19.2 단일화. 태블릿(apps/tablet)과 동일 스택. monorepo 호이스팅 dual-version 충돌 해소 — Hermes bytecode v95/v96 불일치로 인한 Onn 4K silent crash 종결.

## TV 하드웨어 지원 카테고리 (AG-025 정본)
**Google TV / Android TV 12+, 2GB+ RAM, 16GB+ Storage, HDMI 1.4+, Wi-Fi 5+**
- 단일 SKU 의존 금지. Fugo / Scalefusion / PlaySignage 와 동일한 카테고리 인증 방식.
- **공식 지원 SKUs (2026-05) — CI/QA 검증 대상:**
  - **Onn 4K Plus** (Walmart Google TV) — 북미 저가 floor SKU
  - **Onn 4K Pro 2026** (Walmart Google TV) — 중급
  - **Google TV Streamer** — premium / reference 디바이스
- **확장 예정:** 중국산 Android TV 박스 (필요 시 카테고리 충족 SKU 추가 — MECOOL/X96/H96 시리즈 등)
- **Legacy 참고:** Chromecast w/ Google TV (4K) / MECOOL KM2 Plus 는 초기 pilot 디바이스. 공식 지원 목록 아님 — 단, 카테고리 충족 시 best-effort 동작 가능.
- **Build 설정:** `apps/tv/android/gradle.properties` `reactNativeArchitectures=armeabi-v7a,arm64-v8a` (Onn 4K는 armeabi-v7a only — 32-bit). `org.gradle.parallel=false` + `workers.max=1` (16GB dev PC 제약). `newArchEnabled=true` (RN 0.83 default), `hermesEnabled=true`.
- **Runtime capability check:** 부팅 시 SDK 버전 + RAM 검증 (`expo-device` totalMemory) → 미달 시 friendly `UnsupportedDevice` 화면. **특정 modelName 분기 금지.**
- 신규 SKU 검증 시 `docs/TV-COMPATIBILITY.md` (신설 예정) 매트릭스에 결과 등재.

## 3가지 입력 모드
| 모드 | Phase 1 | 구현 순서 |
|------|---------|---------|
| Mode B: Manual Keypad | ✅ 먼저 | 1st |
| Mode A: POS Auto | Mock 테스트 | 2nd |
| Mode C: Hybrid | Phase 1 완성 후 | Later |

## TV② 화면 레이아웃 (HTML 명세 기준)
```
┌─ Header: 레스토랑명 · ORDER READY · 시계 · 활성건수 ─ 8% 높이 ─┐
├─ Promo Zone (좌) ──────┬─ Order Cards (우) ────────────────────┤
│ 이벤트 이미지/정보 28% │ Preparing 컬럼 │ Ready 컬럼 (초록)  │
│                        │ #042 TAKEOUT   │ #038 ✅ (flash)   │
│                        │ #051 DINE-IN   │ #041              │
└────────────────────────┴─────────────────┴───────────────────┘
```

## 표시 한도 (중요 — UX-AUDIT)
- **최대 8개 동시 표시** (Preparing + Ready 합산 아님, 각 컬럼별 8개)
- 초과 시: 오래된 것부터 위로 스크롤
- Ready 카드 30초 후 자동 제거 (독립 타이머)

## 주문 카드 색상 규칙
| 상태 | 색상 |
|------|------|
| New/Prep | 다크 네이비 (#1e293b) |
| Ready | 초록 (#15803d) + flash 애니메이션 |
| POS 자동 주문 | 청록색 배지 |
| Manual 입력 | 주황색 배지 |
| Fading out (제거 직전 3초) | 투명도 1.0 → 0.0 |

## 애니메이션 명세 (react-native-reanimated)
```typescript
// Preparing → Ready 이동: 400ms
// Ready flash: 350ms 주기 반복 (withRepeat)
// 제거 전 fade: opacity 1.0 → 0.0 (3000ms)

const flashAnim = useSharedValue(1);
useEffect(() => {
  if (status === 'ready') {
    flashAnim.value = withRepeat(
      withTiming(0.3, { duration: 350 }),
      -1, true
    );
  }
}, [status]);
```

## Zustand Store ★ v3 정정 — 화면 슬라이스 방식
**규칙:** Zustand에는 모든 활성 주문 보관. 화면에서 `slice(-8)`로 표시만 자른다.
이전 v2의 `slice(-8)` in store는 9번째 주문 입력 시 1번 주문이 **사라지는** 버그.
```typescript
// stores/pickupStore.ts
interface Order {
  id: string; display_number: string;
  status: 'prep'|'ready'; source: string; created_at: string;
}
interface PickupStore {
  preparing: Order[]; ready: Order[];
  addOrder: (o: Order) => void;
  markReady: (display_number: string) => void;
  removeOrder: (display_number: string) => void;
}
export const usePickupStore = create<PickupStore>((set) => ({
  preparing: [], ready: [],
  // ❌ slice(-8) 금지 — 데이터 손실
  // ✅ 전체 보관, 중복 추가만 방지
  addOrder: (o) => set(s => ({
    preparing: s.preparing.find(x => x.id === o.id) ? s.preparing : [...s.preparing, o],
  })),
  markReady: (dn) => set(s => {
    const order = s.preparing.find(o => o.display_number === dn);
    if (!order) return s;
    return {
      preparing: s.preparing.filter(o => o.display_number !== dn),
      ready: [...s.ready, { ...order, status: 'ready' as const }],
    };
  }),
  removeOrder: (dn) => set(s => ({
    ready: s.ready.filter(o => o.display_number !== dn),
  })),
}));

// 화면(PickupScreen.tsx)에서 표시 슬라이스
// const displayPreparing = preparing.slice(-8);   // 최신 8개만 화면 노출
// const displayReady     = ready.slice(-8);
// 9번째 이상은 FlatList 스크롤로 처리, 데이터는 보존
```

## useWebSocket 훅 (AG-002, AG-003)
```typescript
// hooks/useWebSocket.ts
export function useWebSocket(storeId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const { addOrder, markReady, removeOrder } = usePickupStore();

  function connect() {
    const ws = new WebSocket(
      `${process.env.EXPO_PUBLIC_WS_URL}/ws?store_id=${storeId}&device_type=tv`
    );
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.event) {                          // AG-003: 콜론+소문자
        case 'order:new':
          addOrder(msg.payload); break;
        case 'display:order_ready':
          markReady(msg.payload.display_number);
          announce(`Order ${msg.payload.display_number} is ready`); break;
        case 'display:order_remove':
          removeOrder(msg.payload.display_number); break;
      }
    };
    ws.onclose = () => setTimeout(connect, 3000); // AG-002
    const hb = setInterval(() => {
      if (ws.readyState === 1)
        ws.send(JSON.stringify({ event: 'tv:heartbeat', payload: { uptime_s: Date.now() } }));
    }, 30000);
    wsRef.current = ws;
    return () => { clearInterval(hb); ws.close(); };
  }
  useEffect(() => connect(), [storeId]);
  return wsRef;
}
```

## TTS + Fallback (AG-007) ★ v3 정정 — onError 콜백 패턴
**증상(이전 v2):** `Speech.speak()`는 Promise를 반환하지 않으므로(void) `try/await`의 catch에 절대 도달하지 않음 → fallback 무력화.
```typescript
// utils/tts.ts
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

let fallbackSound: Audio.Sound | null = null;

async function playFallback() {
  try {
    if (!fallbackSound) {
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${process.env.EXPO_PUBLIC_S3_URL}/audio/order-ready.mp3` }
      );
      fallbackSound = sound;
    }
    await fallbackSound.replayAsync();
  } catch (e) {
    console.warn('[tts] fallback audio failed', e);
  }
}

export function announce(text: string) {
  // Speech.speak는 void 반환 — onError로만 실패 감지
  Speech.speak(text, {
    language: 'en-US',
    rate: 0.9,
    onError: () => playFallback(),
    // 일부 디바이스는 onStopped로 무음 종료 — 검증 환경에서 추가 시도
  });
}
```

## PickupScreen — 4가지 상태 + 화면 슬라이스 (UX-AUDIT UX-001)
```typescript
// screens/PickupScreen.tsx
export function PickupScreen({ storeId }: { storeId: string }) {
  useKeepAwake();
  const [wsStatus, setWsStatus] = useState<'connecting'|'connected'|'error'>('connecting');
  const { preparing, ready } = usePickupStore();
  useWebSocket(storeId);

  // 화면 슬라이스 — store에는 모두 보존, 8개만 표시
  const displayPreparing = preparing.slice(-8);
  const displayReady     = ready.slice(-8);

  // Loading State
  if (wsStatus === 'connecting') return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#14B8A6" />
      <Text style={styles.statusText}>서버 연결 중...</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Header restaurantName="KITCHEN" activeCount={preparing.length + ready.length} />
      <View style={styles.columns}>
        {/* Preparing 컬럼 */}
        <View style={styles.column}>
          <Text style={styles.colTitle}>🕐 Preparing</Text>
          {displayPreparing.length === 0
            ? <EmptyColumn message="No orders preparing" />
            : <FlatList data={displayPreparing} renderItem={({item}) => <OrderCard order={item} />} />
          }
        </View>
        {/* Ready 컬럼 */}
        <View style={[styles.column, styles.readyCol]}>
          <Text style={styles.colTitle}>✅ Ready for Pickup</Text>
          {displayReady.length === 0
            ? <EmptyColumn message="No orders ready yet" />
            : <FlatList data={displayReady} renderItem={({item}) => <ReadyCard order={item} />} />
          }
        </View>
      </View>
    </View>
  );
}
```

## 완료 체크리스트
- [ ] Zustand pickupStore (8개 한도 적용)
- [ ] useWebSocket (AG-002 재접속, AG-003 이벤트명)
- [ ] PickupScreen UI (Loading/Empty/Error/Offline 4상태 — UX-001)
- [ ] 주문 카드 색상 (상태별)
- [ ] react-native-reanimated 애니메이션 (400ms 이동, 350ms flash, 3s fade)
- [ ] TTS + expo-av fallback (AG-007)
- [ ] expo-keep-awake
- [ ] tv:heartbeat 30초
- [ ] 8개 초과 스크롤 처리
- [ ] 30초 후 자동 제거 (독립 타이머)
- [ ] MECOOL KM2 Plus ADB 실기 테스트

## 테스트 시나리오
```
1. wscat으로 WS 연결 확인
2. POST /api/orders/manual {display_number:"042"} → TV Preparing 표시
3. PATCH status→ready → TV Ready 이동 + flash + TTS
4. 30초 대기 → 자동 제거
5. 9개 주문 입력 → 화면엔 8개만, store에는 9개 모두 (1번 주문 데이터 손실 ❌ 확인) ★ v3
6. WiFi 끊기 → 3초 후 자동 재접속 (AG-002)
7. 음성 TTS 없는 환경 → MP3 fallback 확인 (AG-007 onError)
```

## Phase 2 — 12-theme RN port (2026-05-16)

Web (`apps/api/public/tv-view.html`) already serves the 12 themes from
`packages/shared/src/themes.ts`. Phase 2 brings the same system to the RN TV.

Wired this round:
- `apps/tv/src/utils/fontAssets.ts` — registry of 23 ttf requires (commented; uncomment per file as ttfs land in `apps/tv/assets/fonts/`).
- `apps/tv/src/utils/themeFonts.ts` — CSS-stack + weight → registered fontFamily name. System fallback (no silent substitution) when ttf missing.
- `apps/tv/src/hooks/useThemeFonts.ts` — expo-font loader with optional require so the app still builds before ttfs ship.
- `apps/tv/src/utils/pickupTheme.ts` — `resolvePickupTheme()` returns `{ mode: 'themed' | 'legacy' }`.
- `apps/tv/src/screens/pickup/ThemedPickup.tsx` — full themed render (TopBar, Side, OrderCard) using theme tokens + cardScale.
- `apps/tv/src/screens/SingleVenuePickupScreen.tsx` — branches to ThemedPickup when `storeSettings.theme.theme_key` resolves; legacy emerald path otherwise untouched.
- `apps/tv/package.json` — `expo-font@~12.0.10` (TR-037).
- `apps/tv/src/App.tsx` — boot blocks on `useThemeFonts()` so themes never flash wrong fonts.

Next sub-phases (deferred):
- Drop the 23 Google Font ttfs into `apps/tv/assets/fonts/` and uncomment in `fontAssets.ts`.
- SVG icon set for `readyIcon` (currently emoji stand-ins).
- Pixel-precise letter-spacing / underline polish per design handoff README.

## Ready-only Design-Handoff Layouts (Phase 1 — 2026-05-25)

8 customer-facing visual concepts for the `workflow.pickup_flow === 'ready_only'`
TV. Each layout is distinct (deli counter / airport board / cafe handwriting /
sports LED / Y2K boba / neo-brutalist sticker), not skins of a shared template.
Selected per-store from Dashboard → Display Settings → Ready-only Layout.

| Key | Component | Best for | Display fonts |
|---|---|---|---|
| `now-serving`   | NowServing      | Delis, butchers — single hero number, glanceable 30+ ft | Playfair Display |
| `big-list`      | BigList         | Chipotle/Sweetgreen — 2-col roster        | Manrope |
| `departures`    | DeparturesBoard | Hotel dining, airport food halls          | Inconsolata |
| `names`         | NamesCallout    | Specialty coffee — hero customer name     | Caveat (★ required) |
| `chalkboard`    | Chalkboard      | Indie cafe, brunch                        | Caveat + Patrick Hand |
| `scoreboard`    | ScoreboardLed   | Sports bar, brewpub — 4×2 LED grid        | Press Start 2P + Bebas Neue |
| `boba-pop`      | BobaPop         | Bubble tea, matcha bar — Y2K pastel       | Caveat (★) + Quicksand |
| `sticker-board` | StickerBoard    | Gen-Z indie brand — 4×2 sticker cards     | Archivo Black + Inter |

**Settings keys** (`storeSettings.display.*`):
- `ready_only_layout: 'now-serving' | … | 'sticker-board'`
- `viewing_distance: 'close' | 'medium' | 'far'` — drives column cap
- `ready_only_columns: 'auto' | 1 | 2 | 3 | 4` — manual override (5+ blocked)
- `ready_only_max_visible: 6 | 8 | 10 | 12` — page size; excess cycles 5s

**Architecture:**
- `apps/tv/src/screens/pickup/readyOnlyLayouts/{8 layouts}.tsx` — 1 file per layout
- `_AbsoluteStage.tsx` — 1920×1080 absolute box + `transform:scale()` letterbox (C1)
- `index.tsx OrderReadyBoard` — font fail-loud + page cycler + layout router
- `columnsResolver.ts` — viewing_distance cap + orderCount auto-promote (1–2 → hero)
- `apps/tv/src/utils/readyOnlyFonts.ts` — 23 Google Fonts ttf preload (separate from themed fontAssets)
- `apps/tv/assets/fonts/` — 33 ttfs total (23 themed + 10 ready-only)
- Entry: `SingleVenuePickupScreen.tsx` branches to `<OrderReadyBoard>` when `readyOnly && readyOnlyLayout`; falls through to legacy emerald otherwise.

**Testing on PC (Android TV emulator):**
```bash
# Android Studio → AVD Manager → Create → Google TV 1080p (or Android TV), API 34
pnpm --filter tv start
# In Metro: press `a` to open Android. Emulator boots into the TV app.
# In Dashboard (apps/tablet web): set Display → Pickup Flow = Ready-only,
# pick a Ready-only Layout chip, then add manual orders via dashboard keypad.
```

**Priority device target (2026-05-25 user spec):** Walmart **Onn 4K Plus
Google TV 2025** — entry SKU. Per AG-025, category check only (Google TV /
Android TV 12+, 2GB+ RAM); no SKU-name hardcode in app.

## Current Status
<!-- RS-MD-AUTO:current-status -->
- [2026-05-15 06:37] — done · .env.example,CLAUDE.md,HANDOFF.md
- [2026-05-15 07:22] — done · .env.example,CLAUDE.md,HANDOFF.md
- [2026-05-15 20:54] — done · .env.example,CLAUDE.md,HANDOFF.md
- [2026-05-15 21:01] — done · .env.example,CLAUDE.md,HANDOFF.md
- [2026-05-15 21:04] — done · .env.example,CLAUDE.md,HANDOFF.md
- [2026-05-15 21:46] — done · .env.example,CLAUDE.md,HANDOFF.md
- [2026-05-15 22:07] — done · .env.example,CLAUDE.md,HANDOFF.md
- [2026-05-15 22:10] — done · .env.example,CLAUDE.md,HANDOFF.md
- [2026-05-15 22:19] — done · .env.example,CLAUDE.md,HANDOFF.md
- [2026-05-15 22:38] — done · .env.example,CLAUDE.md,HANDOFF.md
- [2026-05-15 22:52] — done · .env.example,CLAUDE.md,HANDOFF.md
- [2026-05-15 23:00] — done · .env.example,CLAUDE.md,HANDOFF.md
- [2026-05-15 23:25] — done · .env.example,CLAUDE.md,HANDOFF.md
- [2026-05-15 23:40] — done · .env.example,CLAUDE.md,HANDOFF.md
- [2026-05-15 23:44] — done · (no git changes)
- [2026-05-16 02:58] — done · modules/CLAUDE-M02.md
- [2026-05-16 12:53] — done · (no git changes)
- [2026-05-16 12:54] — done · modules/CLAUDE-M02.md
- [2026-05-16 13:09] — done · HANDOFF.md,TOOL-REVIEW.md,apps/tv/package.json
- [2026-05-16 13:11] — done · HANDOFF.md,TOOL-REVIEW.md,apps/tv/package.json
- [2026-05-16 16:56] — done · HANDOFF.md,TOOL-REVIEW.md,apps/api/public/tv-view.html
- [2026-05-16 18:42] — done · (no git changes)
- [2026-05-16 23:00] — done · modules/CLAUDE-M02.md
- [2026-05-16 23:05] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-16 23:18] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-16 23:21] — done · HANDOFF.md,apps/tablet/src/components/TVCard.tsx,modules/CLAUDE-M02.md
- [2026-05-16 23:24] — done · HANDOFF.md,apps/tablet/package.json,apps/tablet/src/components/TVCard.tsx
- [2026-05-16 23:45] — done · HANDOFF.md,apps/tablet/app/(tabs)/tvs/index.tsx,apps/tablet/package.json
- [2026-05-16 23:52] — done · HANDOFF.md,apps/api/public/tv-view.html,apps/tablet/app/(tabs)/tvs/index.tsx
- [2026-05-17 00:59] — done · HANDOFF.md,apps/api/public/tv-view.html,apps/tablet/app/(tabs)/tvs/index.tsx
- [2026-05-17 04:10] — done · HANDOFF.md,apps/api/public/tv-view.html,apps/tablet/app/(tabs)/dashboard/index.tsx
- [2026-05-17 16:52] — done · HANDOFF.md,apps/api/public/tv-view.html,apps/tablet/app/(tabs)/dashboard/index.tsx
- [2026-05-17 17:01] — done · HANDOFF.md,apps/api/public/tv-view.html,apps/tablet/app/(tabs)/dashboard/index.tsx
- [2026-05-17 18:19] — done · HANDOFF.md,apps/api/public/tv-view.html,apps/tablet/app/(tabs)/dashboard/index.tsx
- [2026-05-17 18:40] — done · HANDOFF.md,apps/api/public/tv-view.html,apps/tablet/app/(tabs)/dashboard/index.tsx
- [2026-05-17 19:26] — done · (no git changes)
- [2026-05-17 20:27] — done · HANDOFF.md,apps/tablet/app/(tabs)/dashboard/index.tsx,modules/CLAUDE-M02.md
- [2026-05-17 21:29] — done · HANDOFF.md,apps/tablet/app/(tabs)/dashboard/index.tsx,apps/tablet/app/(tabs)/settings/theme.tsx
- [2026-05-18 02:13] — done · (no git changes)
- [2026-05-23 20:17] — done · HANDOFF.md,packages/shared/src/enums.ts,packages/shared/src/i18n/en.ts
- [2026-05-23 20:17] — done · HANDOFF.md,modules/CLAUDE-M02.md,packages/shared/src/enums.ts
- [2026-05-23 20:23] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-23 20:24] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-23 20:26] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-23 20:28] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-23 20:32] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-23 20:34] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-23 20:37] — done · (no git changes)
- [2026-05-23 20:46] — done · modules/CLAUDE-M02.md
- [2026-05-23 20:56] — done · modules/CLAUDE-M02.md
- [2026-05-23 21:24] — done · modules/CLAUDE-M02.md
- [2026-05-23 21:30] — done · modules/CLAUDE-M02.md
- [2026-05-23 21:44] — done · modules/CLAUDE-M02.md
- [2026-05-23 21:50] — done · modules/CLAUDE-M02.md
- [2026-05-23 22:01] — done · apps/tv/package.json,modules/CLAUDE-M02.md,pnpm-lock.yaml
- [2026-05-23 22:07] — done · apps/tv/metro.config.js,apps/tv/package.json,modules/CLAUDE-M02.md
- [2026-05-23 22:08] — done · apps/tv/metro.config.js,apps/tv/package.json,modules/CLAUDE-M02.md
- [2026-05-23 22:16] — done · (no git changes)
- [2026-05-23 22:27] — done · modules/CLAUDE-M02.md
- [2026-05-23 22:32] — done · modules/CLAUDE-M02.md
- [2026-05-23 22:37] — done · modules/CLAUDE-M02.md
- [2026-05-23 22:44] — done · modules/CLAUDE-M02.md
- [2026-05-23 22:55] — done · modules/CLAUDE-M02.md
- [2026-05-23 23:17] — done · modules/CLAUDE-M02.md
- [2026-05-23 23:29] — done · modules/CLAUDE-M02.md
- [2026-05-23 23:34] — done · modules/CLAUDE-M02.md
- [2026-05-23 23:38] — done · (no git changes)
- [2026-05-23 23:49] — done · (no git changes)
- [2026-05-23 23:52] — done · modules/CLAUDE-M02.md
- [2026-05-23 23:56] — done · (no git changes)
- [2026-05-25 15:37] — done · CLAUDE.md,anti-patterns/ANTI-GLOBAL.md,apps/api/src/db/seed.ts
- [2026-05-25 15:57] — done · CLAUDE.md,anti-patterns/ANTI-GLOBAL.md,apps/api/src/db/seed.ts
- [2026-05-25 17:07] — done · CLAUDE.md,anti-patterns/ANTI-GLOBAL.md,apps/api/src/db/seed.ts
- [2026-05-25 19:53] — done · (no git changes)
- [2026-05-25 19:54] — done · modules/CLAUDE-M02.md
- [2026-05-25 22:33] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-25 22:43] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-25 23:04] — done · HANDOFF.md,anti-patterns/ANTI-M02.md,apps/tablet/app/(tabs)/settings/display.tsx
- [2026-05-25 23:12] — done · (no git changes)
- [2026-05-31 00:33] — done · apps/tv/src/screens/SingleVenuePickupScreen.tsx,apps/tv/src/screens/pickup/ThemedPickup.tsx
- [2026-05-31 00:40] — done · modules/CLAUDE-M02.md
- [2026-05-31 00:53] — done · modules/CLAUDE-M02.md
- [2026-05-31 00:56] — done · (no git changes)
- [2026-05-31 01:28] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-31 04:00] — done · CLAUDE.md,HANDOFF.md,apps/tv/tsconfig.json
- [2026-05-31 04:41] — done · HANDOFF.md
- [2026-05-31 04:44] — done · (no git changes)
- [2026-05-31 15:48] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-31 16:00] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-31 16:06] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-31 21:50] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-31 22:05] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-31 22:10] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-31 22:30] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-31 22:34] — done · HANDOFF.md,modules/CLAUDE-M02.md
- [2026-05-31 23:08] — done · HANDOFF.md,apps/tv/src/store/tvStore.ts,modules/CLAUDE-M02.md
- [2026-06-04 22:58] — done · HANDOFF.md,apps/tv/src/store/tvStore.ts,modules/CLAUDE-M02.md
