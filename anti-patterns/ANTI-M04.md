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

---

## [M04-002] expo-secure-store 웹 미지원 → hydrate 무한 정지
**날짜:** 2026-05-12
**증상:** `expo start --web`에서 Tablet 화면 완전 공백. 콘솔에 `UnavailabilityError: The method or property ExpoSecureStore.getValueWithKeyAsync is not available on web`.
**원인:** `expo-secure-store`는 native 모듈로 web 미지원. `_layout.tsx`의 `hydrate()`가 즉시 reject → `hydrated`가 영원히 `false` → 라우팅 차단.
**해결:** Platform 분기 — web은 `localStorage`, native는 `SecureStore`. hydrate에 try/catch로 어떤 경우에도 `hydrated:true` 보장.
**코드 (apps/tablet/src/store/auth.ts):**
```typescript
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';
const storage = {
  async get(k: string) {
    if (isWeb) { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } }
    return SecureStore.getItemAsync(k);
  },
  async set(k: string, v: string) {
    if (isWeb) { try { globalThis.localStorage?.setItem(k, v); } catch {} return; }
    await SecureStore.setItemAsync(k, v);
  },
  async del(k: string) {
    if (isWeb) { try { globalThis.localStorage?.removeItem(k); } catch {} return; }
    await SecureStore.deleteItemAsync(k);
  },
};

hydrate: async () => {
  try {
    const [token, ...] = await Promise.all([storage.get(KEY.token), ...]);
    set({ token, ..., hydrated: true });
  } catch (err) {
    console.warn('[auth] hydrate failed, defaults used', err);
    set({ hydrated: true });  // 절대 막히지 않도록
  }
}
```
**예방:** native-only API(`expo-secure-store`, `expo-sqlite`, `expo-file-system` 일부 등) 사용 시 Platform 분기 또는 web shim 필수. AG-020 참조.

---

## [M04-003] Zustand ESM `import.meta` → 웹 번들 SyntaxError
**날짜:** 2026-05-12
**증상:** `expo start --web` 화면 완전 공백. 콘솔: `Uncaught SyntaxError: Cannot use 'import.meta' outside a module`. JS 0줄 실행 → React mount 자체 안 됨.
**원인:** Zustand 4.5+ ESM 빌드(`esm/index.mjs`)가 `import.meta.env.MODE` 사용. Metro의 web 번들은 IIFE 스크립트라 `<script type="module">`이 아님 → 브라우저가 `import.meta` 파싱 거부.
**해결:** `metro.config.js`에서 zustand를 web 한정으로 CJS 빌드(`index.js`, 안전한 `process.env.NODE_ENV` 사용)로 강제 alias.
**코드 (apps/tablet/metro.config.js):**
```javascript
const zustandRoot = path.dirname(
  require.resolve('zustand/package.json', { paths: [projectRoot] })
);
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'zustand' || moduleName.startsWith('zustand/'))) {
    const sub = moduleName === 'zustand' ? 'index.js' : moduleName.slice('zustand/'.length) + '.js';
    return { type: 'sourceFile', filePath: path.join(zustandRoot, sub) };
  }
  if (originalResolveRequest) return originalResolveRequest(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};
```
**예방:** ESM 전용 패키지(`import.meta.*`, `top-level await` 등)를 web 번들에 포함 전 검증.
검증법: `grep -rE "import\.meta" node_modules/.pnpm/<pkg>*/node_modules/<pkg>/esm/` 후 매치 있으면 CJS 강제. AG-020 참조.

---

## [M04-004] reanimated v4 ↔ worklets 0.7.x 페어링 (peer dep loose)
**날짜:** 2026-05-12
**증상:** 런타임 에러 — `[Reanimated] Your installed version of Worklets (0.8.3) is not compatible with installed version of Reanimated (4.2.1). Please install Worklets 0.7.x or older.`
**원인:** `react-native-reanimated@4.2.1`의 peer dep 선언이 `react-native-worklets: ">=0.7.0"` 로 너무 loose. pnpm은 만족 가능한 최신 0.8.3을 선택하지만 reanimated 내부 ABI는 0.7.x만 호환.
**해결:** `apps/tablet/package.json`에 `react-native-worklets`를 **직접 의존성**으로 추가하여 버전 고정. (`pnpm overrides`는 lockfile이 up-to-date면 재해석 안 됨 — 직접 dep이 안정적.)
**코드:**
```json
{
  "dependencies": {
    "react-native-reanimated": "~4.2.1",
    "react-native-worklets": "~0.7.4"
  }
}
```
**예방 매트릭스:**
| Reanimated | Worklets |
|-----------|----------|
| 4.0.x     | 0.5.x    |
| 4.1.x     | 0.6.x    |
| 4.2.x     | 0.7.x    |
| 4.3.x+    | 0.8.x    |
Reanimated 업그레이드 시 worklets 동시에 pin. AG-017(패키지 화이트리스트) 예외 — peer dep 정합성 보정은 신규 추가가 아님.

---

## [M04-005] react / react-dom 인스턴스 중복 (pnpm hoisting)
**날짜:** 2026-05-12
**증상:** `Uncaught Error: Incompatible React versions: The "react" and "react-dom" packages must have the exact same version. Instead got: react 19.2.0, react-dom 19.2.6.`
**원인:** Tablet 직접 dep은 둘 다 19.2.0이지만 `@expo/cli` / `@expo/metro-runtime`이 transitively `react-dom@19.2.6`을 끌어옴 → pnpm이 양 버전 동시 설치 → Metro가 두 인스턴스를 동일 번들에 로드 → React 내부 정합성 체크 실패.
**해결:** `metro.config.js`의 `resolver.resolveRequest`로 `react` / `react-dom` 모든 import (subpath 포함)를 tablet 로컬 `node_modules` 단일 경로로 강제 alias.
**코드 (apps/tablet/metro.config.js):**
```javascript
const tabletModules = path.resolve(projectRoot, 'node_modules');
const pinned = {
  react:       path.join(tabletModules, 'react'),
  'react-dom': path.join(tabletModules, 'react-dom'),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  for (const [name, root] of Object.entries(pinned)) {
    if (moduleName === name) {
      return { type: 'sourceFile', filePath: require.resolve(root) };
    }
    if (moduleName.startsWith(name + '/')) {
      return {
        type: 'sourceFile',
        filePath: require.resolve(path.join(root, moduleName.slice(name.length + 1))),
      };
    }
  }
  // ... 나머지 resolver
};
```
**검증법:** 빌드 후 `grep -oE '"19\.[0-9.]+"' dist/_expo/static/js/web/*.js | sort -u` — react 계열은 한 버전만 나와야 함.
**예방:** React major 업그레이드 또는 expo SDK 업데이트 시 항상 react/react-dom dedup 확인. 단일 instance 강제 필수. AG-020 참조.

---

## [M04-006] `Alert.alert` 웹 무반응 → 에러 silent fail
**날짜:** 2026-05-12
**증상:** Tablet web에서 PIN 입력 후 로그인 실패해도 사용자에게 메시지 안 보임. "버튼을 눌렀는데 아무 반응 없음"으로 인식되어 디버깅 시간 낭비.
**원인:** `react-native`의 `Alert.alert(...)`는 React Native Web에서 no-op (또는 console.warn만). native만 동작. 사용자 입장에선 에러 발생 자체를 모름.
**해결:** UI 상태로 에러 표시 — inline error box. Platform.OS 분기로 native는 Alert/Toast, web은 인라인 박스 사용. 또는 통합적으로 인라인만 사용.
**코드 (apps/tablet/app/(onboarding)/index.tsx):**
```tsx
const [error, setError] = useState<string | null>(null);

try {
  const res = await api.post(...);
} catch (err) {
  setError(err instanceof Error ? err.message : 'Login failed');
  setPin('');
}

// JSX
{error && (
  <View style={s.errorBox}>
    <Ionicons name="alert-circle" size={14} color={T.color.error} />
    <Text style={s.errorText}>{error}</Text>
  </View>
)}
```
**재발방지:**
- React Native에서 `Alert.alert`/`ToastAndroid`/`ActionSheetIOS` 사용 시 Platform.OS 분기 또는 cross-platform 라이브러리(`react-native-toast-message` 등 — TOOL-REVIEW 승인 후) 사용
- UX-001(4상태: Loading/Empty/Error/Offline) 중 Error 상태는 항상 화면에 시각적으로 노출. Alert에 의존 금지
- AG-020 §1과 같은 맥락: native-only API의 web shim 필수

---

## [M04-007] 라이브러리가 reanimated 구버전 API에 의존 — `useWorkletCallback` removed in v4
**날짜:** 2026-05-12
**증상:** TVs 탭 진입 시 `Uncaught Error: (0, _reactNativeReanimated.useWorkletCallback) is not a function`. Stack: `@gorhom/bottom-sheet@4.6.4` → `useKeyboard` → `BottomSheet`. 화면 렌더 시 throw.
**원인:** Reanimated v4에서 `useWorkletCallback` 등 일부 hook API가 제거됨. `@gorhom/bottom-sheet@4.x`는 reanimated v3 API에 의존 → v4 환경에서 import-time 또는 첫 사용 시 throw. peer dep 범위가 `>=3.0.0`처럼 너무 넓어 pnpm 설치 시 경고 안 뜸.
**해결:** `@gorhom/bottom-sheet@5.2.14`로 메이저 업그레이드 — peer `react-native-reanimated: ">=3.16.0 || >=4.0.0-"`로 v4 명시 지원. 사용 코드(`snapPoints`/`index`/`sheetRef.expand`/`BottomSheetScrollView`)는 v4↔v5 호환.
**코드 (apps/tablet/package.json):**
```diff
- "@gorhom/bottom-sheet": "^4",
+ "@gorhom/bottom-sheet": "^5.2.14",
```
이후 `pnpm install`. transitive로 `@gorhom/portal@1.0.14` 추가됨 — 같은 organization, backdrop 구현에 사용.
**검증법:**
```bash
# v3 전용 API 사용 dep 사전 스캔 (Reanimated v4 업그레이드 전):
grep -rEl "useWorkletCallback|useAnimatedReaction\b|measure\(" node_modules/.pnpm/@*/node_modules/*/lib/ 2>/dev/null
```
**재발방지:**
- Reanimated 메이저 업그레이드 시 모든 의존 라이브러리의 peer dep window 확인 (특히 `@gorhom/*`, `react-native-skeleton-placeholder`, `react-native-modal`, etc.)
- peer dep loose(`>=3.0.0`)는 pnpm 설치 단계에서 조용히 통과 → 런타임에야 발견. AG-020 §4 매트릭스에 라이브러리 호환성 표 확장
- rn-web-compat-audit 스킬 Check 9로 추가: "reanimated 구버전 API import 사용 dep 스캔"

---

## [M04-008] Engineer Test Mode가 Dashboard React Query 캐시 갱신 안 함
**날짜:** 2026-05-15
**증상:** Settings → Engineer Test Mode에서 주문 생성/벌크/상태 변경해도 Dashboard 탭은 텅 비어있음 ("All caught up!"). TV는 WS로 즉시 반영되는데 Dashboard만 모름.
**원인:** `apps/tablet/app/(tabs)/settings/engineer.tsx` 가 `api.post/api.patch` 직접 호출만 하고 `useQueryClient` 자체를 import 안 함. React Query는 mutation을 통해서만 캐시 무효화하므로, raw API 호출은 어떤 캐시도 invalidate 시키지 못함.
**해결:** 공용 `run` 헬퍼에서 성공 시 `qc.invalidateQueries({queryKey:['orders']})` 1줄 추가. 다른 곳에서도 raw API 호출하는 경우 동일.
**코드 (after):**
```typescript
import { useQueryClient } from '@tanstack/react-query';
// ...
const qc = useQueryClient();
const run = useCallback(async <T,>(...) => {
  // ...
  const r = await fn();
  qc.invalidateQueries({ queryKey: ['orders'] }); // ← 필수
  // ...
}, [flashToast, qc]);
```
**재발방지 규칙:** Tablet 앱 안에서 `api.post/patch/delete`를 useMutation 외부에서 직접 호출한다면 호출자가 반드시 `qc.invalidateQueries` 책임. 또는 useMutation으로 감싸서 onSuccess에서 자동 처리.

---

## [M04-009] Dashboard가 외부 mutation 못 받음 — WS 구독 부재
**날짜:** 2026-05-15
**증상:** POS·키오스크·TV·다른 tablet·Engineer Test Mode에서 주문이 만들어지거나 상태가 바뀌어도 Dashboard 목록은 절대 자동 갱신 안 됨. 사용자가 새로고침 버튼을 직접 눌러야만 보임.
**원인:** Dashboard는 자신의 useMutation onSuccess에서만 `qc.invalidateQueries` 호출. 외부에서 발생한 변경은 알 방법이 없음. tv-view.html이나 engineer.tsx는 WS 구독이 있는데 Dashboard만 없었음.
**해결:** Dashboard에 WS 구독 useEffect 추가. mutating 이벤트 8종 수신 시 React Query invalidate.
**코드 (apps/tablet/app/(tabs)/dashboard/index.tsx):**
```typescript
const ORDER_MUTATING_EVENTS = new Set([
  'order:new', 'order:status_changed', 'order:cancelled', 'order:expired',
  'display:order_ready', 'display:order_remove', 'display:order_expedite',
]);

useEffect(() => {
  if (!storeId || !token || !apiUrl) return;
  let cancelled = false, ws: WebSocket | null = null, reconnect: any = null;
  const open = () => {
    const sock = new WebSocket(`${apiUrl.replace(/^http/,'ws')}/ws?store_id=${storeId}&token=${token}&device_type=tablet`);
    ws = sock;
    sock.onmessage = (e) => {
      const msg = JSON.parse(e.data || '{}');
      if (ORDER_MUTATING_EVENTS.has(msg.event)) qc.invalidateQueries({ queryKey: ['orders'] });
    };
    sock.onclose = () => { if (!cancelled) reconnect = setTimeout(open, 3000); }; // AG-002
  };
  open();
  return () => { cancelled = true; if (reconnect) clearTimeout(reconnect); ws?.close(); };
}, [storeId, token, apiUrl, qc]);
```
**재발방지 규칙:** 데이터 표시 화면(Dashboard / Analytics / KPI 등) 은 모두 mutating WS 이벤트 구독 필수. Mutation을 일으키는 화면(POS 입력, Engineer)과 표시하는 화면이 분리될 때 자동 갱신이 끊김.

---

## [M04-010] Quick Ready 키패드 → INVALID_STATUS_TRANSITION
**날짜:** 2026-05-15
**증상:** Dashboard Quick Ready 키패드에 번호 입력 → READY 버튼 → API 422 `INVALID_STATUS_TRANSITION`. 키패드는 0으로 리셋도 안 되고 TV에도 변화 없음.
**원인:** `PATCH /api/orders/:id/status { status: 'ready' }` 를 무조건 호출. 9-state machine (`shared/enums.ts ORDER_STATUS_TRANSITIONS`)이 `new → ready` 직접 전이를 금지 (반드시 `prep` 경유). 'new' 상태 주문에 직접 ready 패치 시도 시 거부.
**해결:** 현재 상태를 읽고 필요한 만큼 chain transition.
**코드 (apps/tablet/app/(tabs)/dashboard/index.tsx readyMutation):**
```typescript
const patch = (status: string) => api.patch(`/api/orders/${match.id}/status`, { status });
switch (match.status) {
  case 'ready':              return;            // no-op
  case 'new':                await patch('prep'); return patch('ready');
  case 'scheduled':          await patch('new'); await patch('prep'); return patch('ready');
  case 'remaking':           await patch('prep'); return patch('ready');
  case 'prep':
  case 'ready_to_expedite':  return patch('ready');
}
```
**전이 정본:** `packages/shared/src/enums.ts` `ORDER_STATUS_TRANSITIONS` 참조. 어떤 상태→어떤 상태가 허용되는지는 거기서만.
**재발방지 규칙:** "Quick Action" 류 단축 버튼은 항상 multi-step chain 가능성 가정. 단일 PATCH 호출 = state machine 위반 가능성. 또는 백엔드에 `/orders/:id/force_ready` 같은 멱등 endpoint를 추가하는 것이 더 깨끗.

---

## [M04-011] "No active order #X" — GET /api/orders 기본 응답에 활성 주문이 안 들어옴
**날짜:** 2026-05-15
**증상:** TV에는 #32가 명백히 보이는데 Dashboard 키패드에 32 입력하면 "No active order #32" 에러. Engineer Test Mode로 cancelled 주문을 많이 만든 후 발생.
**원인:** `GET /api/orders` 기본 동작:
- `limit: 50` (default)
- `ORDER BY created_at ASC` (가장 오래된 것부터)
- status 필터 없으면 cancelled/expired/collected 등 모든 상태 포함

→ 오래된 cancelled 50개로 응답이 가득 차서 새로 만든 active 주문이 잘림. 클라이언트가 `select`/`filter`로 ACTIVE_STATUSES만 추리는 패턴은 **이미 잘린 응답** 위에서 동작하므로 무용지물.
**해결:** 항상 server-side 필터링 + 최대 limit.
**코드 (after):**
```typescript
const ACTIVE = ['new','prep','ready_to_expedite','ready','remaking','scheduled'];
// useQuery:
queryFn: () => api.get(`/api/orders?status=${ACTIVE.join(',')}&limit=100`),
// readyMutation 안 fresh fetch도 동일:
const list = await api.get<Order[]>(`/api/orders?status=${ACTIVE.join(',')}&limit=100`);
```
**핵심 원칙:** 클라이언트 후처리 필터링 ≠ 서버 필터링. 페이지네이션이 있는 API에서는 반드시 서버에서 필터 적용. AG-021 참조.

---

## [M04-012] expo-router APP_ROOT inline 실패 → web bundle SyntaxError
**날짜:** 2026-05-23
**증상:** `expo export --platform web` 또는 `expo start --web` 실행 시 `Web Bundling failed ... process.env.EXPO_ROUTER_APP_ROOT ... Invalid call at line 2 ... First argument of require.context should be a string` 에러로 번들 차단. (`node_modules/.pnpm/expo-router@55.0.14/.../expo-router/_ctx.web.js`)
**원인:** Expo SDK 55의 `babel-preset-expo`가 빌드 시 `process.env.EXPO_ROUTER_APP_ROOT`를 require.context 인자로 inline해야 하는데, 일부 monorepo + pnpm 환경에서 자동 inline에 실패. `.env.local` 명시는 deny list로 차단(보안 정책).
**해결:** `babel.config.js`에서 babel 평가 시점에 `process.env.EXPO_ROUTER_APP_ROOT`를 절대 경로로 fallback 주입. babel cache는 해당 env 값에 의존하도록 invalidation.
**코드 (apps/tablet/babel.config.js):**
```javascript
const path = require('path');
process.env.EXPO_ROUTER_APP_ROOT =
  process.env.EXPO_ROUTER_APP_ROOT || path.join(__dirname, 'app');

module.exports = function (api) {
  api.cache.using(() => process.env.EXPO_ROUTER_APP_ROOT);
  return { presets: ['babel-preset-expo'], ... };
};
```
**예방:** AG-020 Expo Web 호환성 체크에 "babel-preset-expo 자동 inline 실패 시 .env 또는 babel.config.js fallback 주입" 추가. SDK 메이저 업그레이드 시 재확인.

---

## [M04-013] @gorhom/bottom-sheet × react-native-worklets babel 재처리 SyntaxError
**날짜:** 2026-05-23
**증상:** `expo export --platform web` 실행 시 `[Worklets] Babel plugin exception: ... Missing semicolon. (3:30)` 에러. 위치: `node_modules/.../@gorhom/bottom-sheet/lib/module/components/bottomSheetScrollable/createBottomSheetScrollableComponent.js`. 번들이 1504/1508 modules에서 차단.
**원인:** `@gorhom/bottom-sheet@5.2.14`의 pre-built ESM은 worklet 표현식을 빌드 시점에 처리한 상태인데, 우리 babel 설정의 `react-native-reanimated/plugin`(v4부터 worklets/plugin re-export)이 이를 다시 worklet으로 인식하고 재serialize → 잘못된 코드 생성(`(() => { decelerationRate: ... })` 형태로 statement block 오인).
**해결:** `babel.config.js` `overrides`로 `@gorhom/bottom-sheet` 경로에서만 reanimated/worklets plugin 미적용. bottom-sheet 내부 worklets는 이미 빌드 시 처리되어 있어 plugin 재처리 불필요.
**코드 (apps/tablet/babel.config.js):**
```javascript
module.exports = function (api) {
  return {
    presets: ['babel-preset-expo'],
    overrides: [
      {
        exclude: /node_modules[\\/]+(?:\.pnpm[\\/]+[^\\/]+[\\/]+node_modules[\\/]+)?@gorhom[\\/]+bottom-sheet/,
        plugins: ['react-native-reanimated/plugin'],
      },
    ],
  };
};
```
**예방:** worklets v0.7+ 와 함께 사용하는 외부 라이브러리는 빌드 산출물의 worklet 처리 여부 확인. 라이브러리가 자체적으로 worklet 빌드를 수행하면 우리 babel plugin에서 exclude. dep 업그레이드 시 회귀 확인 필요(plugin 재처리가 정상 동작하는 다른 라이브러리는 영향 없음 — exclude 패턴은 bottom-sheet 한정).
