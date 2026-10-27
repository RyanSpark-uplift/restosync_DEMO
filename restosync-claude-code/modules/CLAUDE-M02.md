# CLAUDE-M02.md — TV② Order Pickup Display
> **세션 로드 순서:** CLAUDE.md → ANTI-GLOBAL.md → ANTI-M02.md → 이 파일
> v2 | Sonnet 4.6 UX 감사 반영 — Loading/Empty 상태, 8개 한도, 애니메이션 명세 추가

---

## 목표
WS 전체 흐름 검증에 최적. M05 완료 후 두 번째로 구현.

## 확정 스택
React Native TV 0.74 · Zustand · expo-speech + expo-av (TTS fallback) · expo-keep-awake · react-native-reanimated

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
