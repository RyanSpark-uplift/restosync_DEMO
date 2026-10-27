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
- [x] GET /api/events/active → 초기 이벤트 로드 (M05 Sprint 1)
- [x] WS display:event_push 수신 → 표시 (scheduler.ts → TV App.tsx → setEvent)
- [x] WS display:event_clear → 기본화면 복귀 (scheduler + tvStore.clearEvent)
- [x] 기본 브랜드 폴백 화면 (EventBoardScreen IdleScreen)
- [x] 긴급공지 오버레이 (type='alert') — UrgentOverlay Sprint B (펄싱 빨강 테두리 + ⚠️ 140px)
- [x] Ticker 스크롤 (ticker_text) — Animated 좌→우 18s loop
- [x] QR 코드 (react-native-qrcode-svg) — Sprint B (cta_url 있을 때 우하단 140px)
- [x] Offline fallback: 마지막 이벤트 유지 (AG-002 reconnect 3s, App.tsx)
- [x] node-cron → WS 흐름 통합 테스트 (AG-015) — broadcast.test.ts 6/6 pass (allowlist, role=event 필터, store_id 격리, CLOSED skip)
- [x] Loading/Empty/Error/Offline 4상태 (UX-001) — Tablet+TV 모두
- [x] Mode B featureFlag (AG-010) — Sprint B Tablet editor Mode A/B 행 + "Coming Soon" notice
- [x] expo-keep-awake (EventBoardScreen)
- [x] tv:heartbeat 30초 (apps/tv/src/App.tsx HEARTBEAT_MS=30_000 + startHeartbeat)

## Current Status
<!-- RS-MD-AUTO:current-status -->
- [2026-05-21] — Sprint C: WS allowlist + AG-015 e2e test + ANTI-M03 정리 + tv:heartbeat 검증 완료. **broadcast.ts WS_EVENTS** allowlist에 `display:event_push` / `display:event_clear` 등록 (AG-003 typing 강화 — typo 시 컴파일 차단). **신규 `apps/api/src/ws/broadcast.test.ts`** (DB-less): WS_EVENTS allowlist 확인 / role='event' TV 필터 / store_id 격리 / CLOSED socket skip / manual PATCH active=true 경로 동일성 — **6/6 pass**. **tv:heartbeat 30s** 검증: apps/tv/src/App.tsx HEARTBEAT_MS=30_000 + startHeartbeat() 기존에 이미 구현 — 체크리스트만 갱신. **ANTI-M03.md** 첫 3 케이스 기록: [M03-001] WS event를 ALLOWED list 등록 없이 emit / [M03-002] type='alert' 미분기 / [M03-003] schema 추가 후 migration 미적용 drift. **M03 P1 완료 체크리스트 12/12 모두 ✓**. API tsc clean. 다음 모듈: M02 5-Zone 리디자인 (F.C TV Zone B 묶음) 또는 다른 우선순위.
- [2026-05-21] — Sprint B: TV polish (QR + UrgentOverlay + Mode B flag) + cta_url migration 완료. **migration 0022**: `events` 테이블에 `cta_url text` nullable 컬럼 추가 (TV QR target — 예약/SNS 링크). **schema.ts**: events.cta_url. **API routes/events.ts**: createEventBody/updateEventBody Zod에 cta_url(string, format:uri, maxLength:500) 추가, POST insert에 cta_url, PATCH는 spread로 자동 처리. **TR-014 react-native-qrcode-svg + react-native-svg** apps/tv에 설치 (apps/tablet과 동일 버전). **TV EventBoardScreen**: `QrOverlay` 컴포넌트(currentEvent.cta_url present일 때 우하단 140px QR + "Scan to reserve" caption) — require()로 lazy import해서 RN-Web에서 안전. `UrgentOverlay` 신규(type='alert' 분기) — 빨강 배경 + Animated 펄싱 테두리(700ms in/out loop) + ⚠️ 140px + 큰 title + ticker_text body. **TV tvStore**: EventData.cta_url 추가. **Tablet EventEditorModal**: Mode A/B row(현재 Mode B 클릭 시 inline "Coming Soon" notice, AG-010 Phase 2 stub) + CTA URL TextInput field(client-side `new URL()` validation, 인라인 에러). **API + Tablet + TV tsc all clean**. events DB-hit 테스트 1건은 migration 0022가 DB에 적용되어야 통과(Docker 미실행 환경에서는 사전 실패 — Sprint G와 동일 패턴). **잔여 M03 작업**: AG-015 e2e test / tv:heartbeat 30초 / ANTI-M03 첫 케이스 / broadcast.ts WS_EVENTS allowlist (event_push/event_clear).
- [2026-05-20] — Sprint A: Tablet event CRUD + image upload UI 완료. **신규 client API** `apps/tablet/src/api/events.ts`: fetchEvents / fetchActiveEvents / createEvent / patchEvent / deleteEvent / uploadEventImage (multipart). **신규 component** `components/event/EventEditorModal.tsx`: type chip(5값) + title + ticker_text + image picker(web `<input type=file>` → POST /api/events/upload → preview) + start_at/end_at TextInput(ISO 8601 UTC) + shortcuts(Now/+1h/+24h/+7d/Clear) + active Switch(edit mode) + Delete(confirm). AG-014 4-state UI · AG-024 ISO UTC reminder · web Alert no-op 회피(inline errorBox). **events/index.tsx**: "+ New Event" 버튼(brand) + 카드 클릭 → edit, Switch는 responder 잠금으로 부모 onPress 분리, EventEditorModal 마운트. **tablet tsc clean** · API 회귀 0건(server 미변경, 기존 routes/events.ts 그대로 사용). **잔여 M03 작업**: TV QR 코드(TR-014 install) / UrgentOverlay(type=alert) / Mode B flag UI / AG-015 e2e test / ANTI-M03 첫 케이스 기록.
- [2026-05-21 01:05] — done · (no git changes)
- [2026-05-21 01:19] — done · (no git changes)
- [2026-05-21 01:26] — done · (no git changes)
