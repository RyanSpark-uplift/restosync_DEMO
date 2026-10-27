# CLAUDE-M03.md — TV③ Event & Promo Board
> **세션 로드 순서:** CLAUDE.md → ANTI-GLOBAL.md → ANTI-M03.md → 이 파일
> v2 | Sonnet 4.6 UX 감사 반영 — node-cron 연동 흐름, Offline 처리, QR 코드 추가

---

## 확정 스택
React Native TV 0.74 · Zustand (eventStore) · expo-keep-awake · expo-file-system · react-native-qrcode-svg

## node-cron ↔ TV③ 연동 흐름 (AG-015 — 핵심)
```
[M05 scheduler.ts — node-cron 1분 주기]
  start_at 도달 → DB events.active=true
  → WS broadcast display:event_push (payload: Event 전체)
  → TV③ EventScreen 수신 → 전체화면 표시

  end_at 도달 → DB events.active=false
  → WS broadcast display:event_clear ({event_id})
  → TV③ → 기본 브랜드 화면 복귀
```

## 이벤트 유형 (eventTypeEnum)
| type | 화면 | 용도 |
|------|------|------|
| happy_hour | 전체화면 이미지 + ticker | Happy Hour 프로모 |
| live_event | 전체화면 이미지/영상 | 라이브 공연 등 |
| lto | 전체화면 + 카운트다운 | Limited Time Offer |
| alert | 오버레이 배너 | 긴급공지 |
| promo | 슬라이드쇼 | 일반 프로모션 |

## TV③ 화면 구성
```
전체화면 이미지/영상
├── 하단 Ticker 스크롤 (ticker_text 필드)
└── 우하단 QR 코드 (react-native-qrcode-svg — 예약/SNS 링크)
```

## WS 이벤트
| 이벤트 | 처리 |
|--------|------|
| `display:event_push` | 이벤트 표시, payload: Event 전체 |
| `display:event_clear` | 기본화면 복귀, payload: {event_id} |

## EventScreen — 4가지 상태 포함 (UX-001)
```typescript
// screens/EventScreen.tsx
export function EventScreen({ storeId }: { storeId: string }) {
  useKeepAwake();
  const [wsConnected, setWsConnected] = useState(false);
  const { activeEvent } = useEventStore();
  const wsRef = useWebSocket(storeId, { onOpen: () => setWsConnected(true) });

  // Loading: WS 연결 중
  if (!wsConnected) return (
    <View style={styles.center}>
      <ActivityIndicator color="#F59E0B" />
      <Text style={styles.text}>연결 중...</Text>
    </View>
  );

  // Empty: 이벤트 없음 → 브랜드 기본화면
  if (!activeEvent) return <BrandDefaultScreen />;

  // Urgent 오버레이 처리
  if (activeEvent.type === 'alert') return <UrgentOverlay event={activeEvent} />;

  // 일반 이벤트
  return (
    <View style={{ flex: 1 }}>
      <EventDisplay event={activeEvent} />
      {activeEvent.ticker_text && <TickerScroll text={activeEvent.ticker_text} />}
    </View>
  );
}
```

## Offline 처리 (UX-AUDIT — M03 유일 누락)
```typescript
// WS 끊겨도 마지막 이벤트 유지 (메모리에)
// 재연결 후 GET /api/events/active → 최신 상태 동기화
// AG-002: ws.onclose → setTimeout(connect, 3000)
```

## Mode A / B featureFlag (AG-010)
```typescript
// Phase 1: Mode A만 (직접 이미지 업로드)
// Phase 2: Mode B (AI 자동 디자인 — featureFlags.aiEventDesign=false)
// UI에 Mode B 버튼 표시, 탭 시 "Coming Soon" Toast
```

## 완료 체크리스트
- [ ] GET /api/events/active → 초기 이벤트 로드
- [ ] WS display:event_push 수신 → 표시
- [ ] WS display:event_clear → 기본화면 복귀
- [ ] 기본 브랜드 폴백 화면 (BrandDefaultScreen)
- [ ] 긴급공지 오버레이 (type='alert')
- [ ] Ticker 스크롤 (ticker_text)
- [ ] QR 코드 (react-native-qrcode-svg)
- [ ] Offline fallback: 마지막 이벤트 유지 (AG-002)
- [ ] node-cron → WS 흐름 통합 테스트 (AG-015)
- [ ] Loading/Empty/Error/Offline 4상태 (UX-001)
- [ ] Mode B featureFlag (AG-010)
- [ ] expo-keep-awake
- [ ] tv:heartbeat 30초
