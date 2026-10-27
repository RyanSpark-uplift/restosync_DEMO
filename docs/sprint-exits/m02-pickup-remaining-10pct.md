# M02 Pickup — 잔여 10% 작업 리스트
> Sprint 0 D2-3 산출 · @backend-dev 분류
> 분류 기준: P1 (운영 막힘) / P2 (UX) / P3 (polish)
> Sprint 0 fit = Sprint 1 시작 전 끝낼 수 있는 항목

## P1 — 운영 막힘 (Sprint 0 must-fix)

| ID | 항목 | 근거 | 검증 |
|----|------|------|------|
| M02-P1-A | dogfooding 14일 일일 로그 템플릿 + slack 알림 채널 | PRD §19.7 S6.8 | daily 30분 체크 폼 commit |
| M02-P1-B | AG-021 list endpoint 점검 — `/api/orders?status=&limit=100` 명시 (dashboard, analytics, settings/engineer 모두) | ANTI-GLOBAL §AG-021 | 코드 grep 결과 0 violation |
| M02-P1-C | display_number recycle 매칭 — `find` 시 활성 status + DESC created_at 필터 ([M04-011] 참조) | AG-021 |  관련 코드 검토 PR |

> Ryan dogfooding 시작 후 발견되는 P1은 본 파일에 즉시 추가. M02 ANTI-M02.md에도 동시 기록.

## P2 — UX 개선 (Sprint 0 ~ Sprint 1 병행)

| ID | 항목 | 근거 |
|----|------|------|
| M02-P2-A | TV `apps/tv/assets/fonts/` 23개 Google Font ttf 추가 + `fontAssets.ts` 활성화 | CLAUDE-M02 "Next sub-phases" |
| M02-P2-B | `readyIcon` SVG 아이콘 세트로 교체 (현 emoji stand-in) | 동상 |
| M02-P2-C | Letter-spacing / underline 정밀 polish (design handoff README) | 동상 |
| M02-P2-D | RN Web 호환성 정기 audit (`rn-web-compat-audit` skill) — 새 패키지/SDK 추가 시 | AG-020 |

## P3 — Polish (Sprint 6 buffer)

| ID | 항목 |
|----|------|
| M02-P3-A | 12-theme picker JPG thumb → WebP 변환 (CDN bandwidth) |
| M02-P3-B | TTS fallback MP3 다국어 (현재 en-US만) |

## Sprint 0 fit 분류

- **Sprint 0 안에 처리**: M02-P1-A, M02-P1-B, M02-P1-C
- **Sprint 1과 병행**: M02-P2-A ~ D (디자인 핸드오프 ttf 도착 시점에 의존)
- **Sprint 6로 미루기**: P3 전체

## Dogfooding 14일 계획 — **Sprint 6 매장 설치 후 시작**

**현 상태:** 본인 매장 영업 중이나 RestoSync 미설치 (개발 단계). dogfooding은 MVP 완성 + 매장 설치 후 14일 카운트.

```
Sprint 0~5 (Week 0-10): 코드 개발 + CI/E2E 테스트로 검증
Sprint 6 D1-2 (Week 11): 본인 매장 하드웨어 설치 + seed (실 메뉴 Excel 이전)
Sprint 6 D3 ~ Phase 1.5 W2: dogfooding 14일 카운트 시작
  ├─ 매일 30분 docs/dogfooding/YYYY-MM-DD.md 작성
  ├─ 발견 버그 → ANTI-M02 [M02-NNN] 즉시 기록
  └─ 주말 1단락 요약
```

**Activation 트리거:** Sprint 6 D1 매장 setup 완료 → 그 다음 영업일부터 카운트.
**Daily log 양식:** `docs/dogfooding/template-daily-log.md` (이미 준비됨, 매장 설치일에 활성화).
**Daily log 필드**: order_count, ws_disconnect_count, tts_fail_count, ui_glitch (스크린샷), 야간 문구.
