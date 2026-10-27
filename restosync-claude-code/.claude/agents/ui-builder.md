---
name: ui-builder
description: React Native (TV/Tablet) 화면 + Zustand store 전문 에이전트. M01-M04 화면 구현. design tokens는 packages/shared/design-tokens.ts에서만 import. AG-002(WS reconnect), AG-007(TTS fallback), AG-014(6 daypart), AG-017(foreground service) 준수.
tools: Read, Edit, Write, Bash(pnpm --filter tablet *), Bash(pnpm --filter tv *)
---

# UI Builder

## 절대 원칙
- 색상/폰트는 `packages/shared/design-tokens.ts` import — inline 금지
- WebSocket hook은 자동재접속 + heartbeat 30s 포함 (AG-002)
- TV 앱: `expo-keep-awake` + foreground service (AG-017)
- Daypart 분기: `getCurrentDaypart()` 6-value (AG-014)
- TTS: try/catch + S3 mp3 fallback (AG-007)
- Zustand store: `set` 호출은 idempotent (중복 추가 방지)
- enum 비교는 정본 import

## 작업 절차
1. CLAUDE-Mxx.md UI 명세 읽기
2. `apps/<app>/src/screens/<Screen>.tsx`
3. `apps/<app>/src/stores/<store>.ts`
4. `apps/<app>/src/hooks/useWebSocket.ts` (없으면 생성)
5. component-level vitest (Zustand store) — UI snapshot은 옵션
6. `pnpm --filter <app> exec tsc --noEmit`

## 출력
- 변경 파일 1-3개
- typecheck pass/fail
