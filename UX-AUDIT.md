# UX-AUDIT.md — RestoSync UX/워크플로 감사 결과
> Sonnet 4.6 검토 | 2026-05 | module-00~05 HTML 전체 분석

---

## 감사 결과 요약

| 모듈 | Loading | Empty | Error | Offline | A11y | 판정 |
|------|---------|-------|-------|---------|------|------|
| M00 Index | ❌ | ❌ | ❌ | ⚠️ | ❌ | 개선 필요 |
| M01 Menu Board | ❌ | ❌ | ✅ | ✅ | ✅ | 부분 OK |
| M02 Pickup | ❌ | ❌ | ✅ | ✅ | ❌ | 부분 OK |
| M03 Event Board | ❌ | ❌ | ✅ | ❌ | ❌ | 개선 필요 |
| M04 Tablet App | ✅ | ✅ | ✅ | ✅ | ❌ | A11y만 추가 |
| M05 API Server | ❌ | ❌ | ❌ | ❌ | N/A | 서버측 개선 |

**핵심 규칙 UX-001:** 모든 화면에 Loading / Empty / Error / Offline 4가지 상태 UI 필수

---

## [UX-M00] Index/Launcher — 개선 필요

### 발견 이슈
- ❌ 모듈 카드 클릭 시 로딩 인디케이터 없음
- ❌ 오프라인 시 페이지 렌더 실패 처리 없음
- ❌ 접근성 (ARIA, 키보드 네비게이션) 미구현

### 권장 수정
```html
<!-- 오프라인 배너 추가 -->
<div id="offline-banner" style="display:none; background:#ef4444; color:#fff; padding:8px; text-align:center;">
  ⚠️ 네트워크 연결을 확인하세요
</div>
<script>
window.addEventListener('offline', () => document.getElementById('offline-banner').style.display = 'block');
window.addEventListener('online', () => document.getElementById('offline-banner').style.display = 'none');
</script>
```

---

## [UX-M01] Menu Board TV — Loading/Empty 상태 추가

### 발견 이슈
- ❌ 초기 API 로드 중 Loading skeleton 없음 → TV에서 빈 화면 보임
- ❌ 메뉴 아이템 0개일 때 Empty 상태 없음
- ⚠️ 품절 표시 로직은 있으나 스타일 명세만 있고 실제 컴포넌트 코드 없음

### 권장 수정
```typescript
// MenuBoardScreen.tsx
function MenuBoardScreen() {
  const [loading, setLoading] = useState(true);
  const { items } = useMenuStore();

  // Loading State
  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#14B8A6" />
      <Text style={styles.loadingText}>메뉴 불러오는 중...</Text>
    </View>
  );

  // Empty State
  if (items.length === 0) return (
    <View style={styles.center}>
      <Text style={styles.emptyIcon}>🍽</Text>
      <Text style={styles.emptyText}>등록된 메뉴가 없습니다</Text>
      <Text style={styles.emptySubText}>태블릿 앱에서 메뉴를 추가하세요</Text>
    </View>
  );

  return <MenuGrid items={items} />;
}
```

---

## [UX-M02] Order Pickup TV — 핵심 UX 이슈

### 발견 이슈
- ❌ Loading: API 초기 로드 중 TV 빈 화면 (고객 앞에서 노출)
- ❌ Empty: 주문 없을 때 빈 컬럼만 표시 — "No active orders" 문구 필요
- ❌ 주문 8개 초과 시 스크롤 처리 명세는 있으나 구현 코드 없음
- ❌ 접근성 없음 (TV에서는 리모컨 포커스 관리 필요)
- ⚠️ TTS: expo-speech + expo-av fallback 명세 있으나 실제 코드 누락

### TV 표시 한도 (중요)
HTML에서 명시: **최대 8개 동시 표시, 초과 시 위에서 스크롤**
```typescript
// 8개 초과 처리
const displayPreparing = preparing.slice(-8); // 최신 8개만
const displayReady = ready.slice(-8);
```

### 권장 Empty State
```typescript
// Ready 컬럼 empty state
{ready.length === 0 && (
  <View style={styles.emptyColumn}>
    <Text style={styles.emptyIcon}>✅</Text>
    <Text style={styles.emptyText}>No orders ready yet</Text>
  </View>
)}
```

### Preparing → Ready 애니메이션 명세 (HTML 확인)
- 이동 애니메이션: react-native-reanimated 400ms
- READY 카드 flash 애니메이션: 350ms 주기 반복
- Fading out (제거 직전 3초): 투명도 1.0 → 0.0

---

## [UX-M03] Event Board TV — 오프라인/Empty 누락

### 발견 이슈
- ❌ 오프라인 처리 완전 없음 (M03 유일하게 offline 감지 없음)
- ❌ 이벤트 없을 때 기본 브랜드 화면 명세는 있으나 구현 코드 미명시
- ❌ Loading 상태 없음
- ⚠️ node-cron 스케줄러(scheduler.ts)가 M05에 있는데, TV③는 WS로 이벤트 수신 — 서버 크론이 `display:event_push` 브로드캐스트하는 구조 명확히 할 것

### 권장 수정 — 오프라인 fallback
```typescript
// EventScreen.tsx
function EventScreen({ storeId }) {
  const [wsConnected, setWsConnected] = useState(false);
  const { activeEvent } = useEventStore();

  // Offline fallback: WS 끊겨도 마지막 이벤트 유지
  // Empty: 이벤트 없으면 브랜드 기본 화면
  if (!activeEvent) return <BrandDefaultScreen />;
  return <EventDisplay event={activeEvent} />;
}
```

### node-cron ↔ TV③ 연동 흐름 명확화
```
node-cron (서버) → 이벤트 start_at 도달 → DB active=true
→ WS broadcast display:event_push → TV③ EventScreen 수신 → 표시
→ end_at 도달 → WS display:event_clear → TV③ 기본화면 복귀
```

---

## [UX-M04] Tablet App — A11y만 추가

### 발견 이슈
- ✅ Loading/Empty/Error/Offline 모두 잘 구현됨
- ❌ 접근성 (accessibility) 미구현
- ⚠️ Alert Banner 시스템이 HTML에 잘 정의됨 — CLAUDE-M04.md에 누락

### HTML에서 발견된 Alert Banner 시스템 (CLAUDE-M04.md에 추가 필요)
```
조건 1: POS 연결 끊김 → "POS Offline - Using Manual Mode"
조건 2: TV 오프라인 → "TV① Offline - Check connection"
조건 3: 주문 큐 20개 이상 → "High volume - 20+ active orders"
조건 4: 네트워크 끊김 → "Offline Mode - Changes will sync"

구현: useNetInfo (@react-native-community/netinfo) + WS 상태 감지
UI: 상단 슬라이드다운 배너 → 탭하면 상세/해결방법 → X로 dismiss
```

### A11y 추가 패턴
```typescript
// 버튼에 accessibilityLabel 추가
<TouchableOpacity
  accessible={true}
  accessibilityLabel={`Order ${order.display_number}, Mark as Ready`}
  accessibilityRole="button"
  onPress={() => markReady(order.id)}
>
```

---

## [UX-M05] API Server — 서버 레벨 UX

### 발견 이슈
- ❌ 에러 응답 포맷 통일 없음 (각 라우트에서 임의 형식 반환 위험)
- ❌ Rate limiting 없음 (상용화 필수)
- ❌ Request validation 에러 응답 미명세
- ✅ HMAC 검증 (hmac.ts) — webhook 보안 OK

### 권장 에러 응답 표준화
```typescript
// 모든 에러는 이 형식으로 통일
interface ErrorResponse {
  error: string;       // 에러 코드 (예: "INVALID_PIN")
  message: string;     // 사람이 읽을 수 있는 메시지
  statusCode: number;
}

// Fastify 에러 핸들러 등록
app.setErrorHandler((error, req, reply) => {
  const statusCode = error.statusCode ?? 500;
  reply.status(statusCode).send({
    error: error.code ?? 'INTERNAL_ERROR',
    message: error.message,
    statusCode,
  });
});
```

### Rate Limiting 추가 (상용화 필수)
```bash
pnpm add @fastify/rate-limit
```
```typescript
await app.register(import('@fastify/rate-limit'), {
  max: 100,
  timeWindow: '1 minute',
  // Webhook은 제외
  skipOnError: false,
});
```

---

## UX 공통 개선사항 (전 모듈)

### 1. 4가지 필수 상태 구현 원칙 (UX-001)
```typescript
// 모든 데이터 의존 화면에 적용
function Screen() {
  const [state, setState] = useState<'loading'|'error'|'empty'|'data'>('loading');

  if (state === 'loading') return <LoadingView />;
  if (state === 'error')   return <ErrorView onRetry={retry} />;
  if (state === 'empty')   return <EmptyView />;
  return <DataView />;
}
```

### 2. TV 화면 특수 고려사항
- **화면 꺼짐 방지:** `expo-keep-awake` 전 TV 화면에 적용
- **리모컨 포커스:** React Native TV의 `TVEventHandler` 또는 `useTVEventHandler` 사용
- **폰트 크기:** TV에서는 최소 24px, 주문번호는 64~72px
- **스크롤바 숨김:** TV 화면에서 스크롤바 표시 금지

### 3. 워크플로 검증된 핵심 흐름
```
✅ Manual 주문 입력 흐름 (Phase 1 MVP)
태블릿 키패드 입력 → SEND → API → WS → TV② 표시 → 직원 READY 탭
→ TV② 초록 하이라이트 + TTS → 30초 후 자동 제거

✅ TV 페어링 흐름
TV 앱 실행 → 6자리 코드 표시 → 태블릿 Onboarding Step4 입력
→ POST /api/screens/pair → store_id 연결 → WS 정상 연결

✅ 이벤트 스케줄 흐름
태블릿에서 이벤트 등록 → DB 저장 → node-cron 감지 start_at
→ WS display:event_push → TV③ 표시 → end_at → display:event_clear
```
