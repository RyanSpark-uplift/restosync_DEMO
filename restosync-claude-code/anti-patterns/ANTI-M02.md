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
