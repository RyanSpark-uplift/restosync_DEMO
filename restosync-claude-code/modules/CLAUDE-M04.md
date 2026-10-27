# CLAUDE-M04.md — Tablet Control App
> **세션 로드 순서:** CLAUDE.md → ANTI-GLOBAL.md → ANTI-M04.md → 이 파일
> v2 | Sonnet 4.6 UX 감사 반영 — Alert Banner, netinfo, A11y 추가

---

## 확정 스택
React Native 0.74 · Expo SDK 51 · Expo Router v3 · Zustand · React Query
expo-secure-store · expo-sqlite · @react-native-community/netinfo

## Expo Router 라우팅
```
apps/tablet/app/
├── _layout.tsx             ← onboarding/login 리다이렉트
├── (onboarding)/
│   ├── step1-license.tsx   ← 라이선스 키 (RS-XXX-XXXX-XXXX)
│   ├── step2-wifi.tsx      ← API 서버 ping 테스트
│   ├── step3-pos.tsx       ← POS 연동 선택
│   ├── step4-pairing.tsx   ← TV 6자리 코드 입력 (AG-008)
│   ├── step5-brand.tsx     ← 매장명/로고/색상
│   └── step6-golive.tsx    ← TV 상태 확인 + 테스트 주문
├── login.tsx               ← PIN 4자리 패드
└── (tabs)/
    ├── dashboard.tsx       ← KPI + Alert Banner + Quick Actions
    ├── orders.tsx          ← 필터 탭 + Manual 입력 FAB
    ├── menu.tsx            ← CRUD + 이미지 업로드 + 품절 토글
    ├── events.tsx          ← 이벤트 스케줄러 (Mode A)
    ├── tv-control.tsx      ← TV 온라인 상태 + 콘텐츠 변경
    └── settings.tsx        ← POS/Webhook/PIN 설정
```

## 루트 레이아웃
```typescript
// app/_layout.tsx
export default function RootLayout() {
  const { isOnboarded, isLoggedIn } = useStore();
  if (!isOnboarded) return <Redirect href="/onboarding/step1-license" />;
  if (!isLoggedIn)  return <Redirect href="/login" />;
  return <Slot />;
}
```

## PIN 로그인 ★ v3 정정 — server-side 잠금
**증상(이전 v2):** `setFailCount` + `setLocked`는 React state. 앱 재시작 시 카운터 리셋되어 brute-force 가능.
**규칙:** 잠금은 서버에서. 클라이언트는 표시만.
```typescript
// app/login.tsx — 4자리 패드, 서버가 진짜 게이트키퍼 (AG-005, AG-006)
async function login(pin: string) {
  const storeId = await SecureStore.getItemAsync('store_id');
  const userId  = await SecureStore.getItemAsync('user_id');
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_id: storeId, user_id: userId, pin }),
  });

  if (res.status === 423) {  // LOCKED
    const { retry_after_s } = await res.json();
    setLockedRemaining(retry_after_s);  // UI 카운트다운만
    throw new Error(`Locked, retry in ${retry_after_s}s`);
  }
  if (res.status === 401) {
    const { attempts_remaining } = await res.json();
    setRemainingMsg(`PIN incorrect — ${attempts_remaining} attempts remaining`);
    throw new Error('PIN incorrect');
  }

  const { access_token, refresh_token } = await res.json();
  await SecureStore.setItemAsync('access_token', access_token);   // 15분
  await SecureStore.setItemAsync('refresh_token', refresh_token); // 30일
}
```

**서버측 (apps/api/src/routes/auth.ts) 처리:**
```typescript
// Redis key: auth:fail:<store_id>:<user_id>  (TTL 15분)
// Redis key: auth:lock:<store_id>:<user_id>  (TTL 30s, set 시 fail 카운터 리셋)

const lockKey = `auth:lock:${storeId}:${userId}`;
const failKey = `auth:fail:${storeId}:${userId}`;

const lockedTtl = await redis.ttl(lockKey);
if (lockedTtl > 0) {
  return reply.status(423).send({ error: 'LOCKED', retry_after_s: lockedTtl });
}

const ok = await bcrypt.compare(pin, user.pin_hash);
if (!ok) {
  const fails = await redis.incr(failKey);
  if (fails === 1) await redis.expire(failKey, 900); // 15분 윈도우
  if (fails >= 3) {
    await redis.set(lockKey, '1', 'EX', 30);  // 30초 잠금
    await redis.del(failKey);
    return reply.status(423).send({ error: 'LOCKED', retry_after_s: 30 });
  }
  return reply.status(401).send({
    error: 'INVALID_PIN',
    attempts_remaining: Math.max(0, 3 - fails),
  });
}

await redis.del(failKey);  // 성공 시 카운터 리셋
// JWT 발급 (AG-006: jti 포함)
```

## Dashboard Alert Banner 시스템 (HTML 명세 기준)
```typescript
// components/AlertBanner.tsx
// 4가지 조건에서 자동 표시
const { isConnected } = useNetInfo();  // @react-native-community/netinfo
const { wsConnected } = useStore();
const { tvScreens } = useStore();

const alerts = [
  !isConnected && { type: 'error', msg: 'Offline Mode - Changes will sync' },
  !wsConnected && { type: 'warn', msg: 'Server disconnected - Reconnecting...' },
  tvScreens.some(s => !s.online) && { type: 'warn', msg: `TV Offline - Check connection` },
  activeOrders.length >= 20 && { type: 'info', msg: 'High volume - 20+ active orders' },
].filter(Boolean);

// UI: 상단 슬라이드다운 배너 → 탭하면 해결방법 → X dismiss
```

## Dashboard Quick Actions
```typescript
// Phase 1 활성
// ✅ Mark All Ready — 전체 prep → ready
// ✅ Push Menu — WS display:menu_refresh 수동 전송
// ✅ Mute Alerts — TTS 음소거 토글
// ❌ AI Ad Now — featureFlag.aiMenuSuggestion=false (AG-010)
```

## Orders 화면 핵심
```typescript
// 탭 필터: All / New / Preparing / Ready
// 소스 필터: POS / DoorDash / UberEats / Grubhub / Manual
// 상태 변경: PATCH /api/orders/:id/status
// WS: order:status_changed → 자동 리스트 갱신
// Swipe: react-native-gesture-handler/Swipeable → swipe left = cancel

// A11y 추가 (UX-AUDIT)
<TouchableOpacity
  accessible={true}
  accessibilityLabel={`Order ${order.display_number}, ${order.status}, Mark as Ready`}
  accessibilityRole="button"
/>
```

## 오프라인 SQLite 큐
```typescript
// 네트워크 끊김 시 manual 주문 → expo-sqlite 로컬 큐 저장
// 재연결 시 큐에서 꺼내 POST /api/orders/manual
import * as SQLite from 'expo-sqlite';
const db = SQLite.openDatabaseSync('restosync.db');
```

## 완료 체크리스트
- [ ] Onboarding 6단계 (Step4 TV 페어링 필수 — AG-008)
- [ ] PIN 로그인 (4자리, 3회 실패 잠금, 15분 자동잠금)
- [ ] JWT access+refresh 이중 토큰 (AG-006)
- [ ] Alert Banner 4종 (AG-002 + netinfo)
- [ ] Dashboard KPI (WS 실시간 + 3초 polling fallback)
- [ ] Quick Actions (Mark All Ready, Push Menu, Mute)
- [ ] Orders (탭 필터, 소스 필터, 상태 변경, Manual FAB)
- [ ] WS 오프라인 감지 + 자동재접속 (AG-002)
- [ ] Menu Editor (CRUD + 이미지 업로드 + 품절 토글)
- [ ] Event Scheduler (Mode A 이미지 업로드)
- [ ] TV Control (온라인 상태 + 콘텐츠 변경)
- [ ] Settings (POS API Key, Webhook URL 설정)
- [ ] A11y: accessibilityLabel/Role 전 버튼에 추가
- [ ] expo-sqlite 오프라인 큐
- [ ] iPad + Android 태블릿 실기 테스트
