# TOKEN-MONITOR.md — 토큰 & 캐시 최적화 가이드
> v2 | Sonnet 4.6 | 이미지 진단 결과 적용 (cache hit 37% → 85%+ 목표)

---

## 진단 결과 요약 (2026-05)
| Pattern | 문제 | 예상 낭비 | 조치 |
|---------|------|----------|------|
| #1 Context Bloat | 100k+ ctx, 20+ turns | $12.40 | 세션 분리 유지 |
| #2 Giant Tool Outputs | tool_result ≥50k chars | $8.75 | 요약 후 전달 |
| **#3 Poor Cache Util** | **hit 37%, ctx>30k** | **$18.20** | **CLAUDE.md 슬림화 ✅ 완료** |
| #4 Duplicate Tools | 중복 호출 41회 | $3.10 | 1회만 호출 |
| #5 Subagent Overuse | avg 2.1 turn/sub | $2.55 | 필요시만 사용 |

**TOP FIX 완료:** CLAUDE.md 393줄 → 115줄 (캐시 앵커 추가)

---

## 캐시 최적화 원칙
```
1. CLAUDE.md ≤ 150줄 유지 (현재 115줄 ✅)
2. 세션 시작 4개 파일만 로드 (CLAUDE + ANTI-GLOBAL + ANTI-Mxx + CLAUDE-Mxx)
3. 상세 코드는 CLAUDE-Mxx.md에, CLAUDE.md는 참조만
4. 파일 상단 <!-- CACHE ANCHOR --> 주석으로 캐시 적중 유도
```

---

## 세션 시작 명령어 템플릿
```
Read these 4 files in order, then confirm "Loaded ✓":
1. CLAUDE.md
2. anti-patterns/ANTI-GLOBAL.md
3. anti-patterns/ANTI-M05.md   ← 해당 모듈로 교체
4. modules/CLAUDE-M05.md       ← 해당 모듈로 교체

Also read: TOOL-REVIEW.md (상용화 라이선스 확인용)
Confirm loaded, then start [작업].
```

---

## 세션별 토큰 목표
| 세션 | 목표 비용 |
|------|-----------|
| M05 API Server | < $3.5 |
| M02 TV Pickup | < $1.8 |
| M04 Tablet App | < $2.8 |
| M01 TV Menu | < $1.6 |
| M03 TV Event | < $1.1 |
| **총합** | **< $11** |

---

## 세션 종료 체크리스트
```
□ /cost 확인
□ 발생 오류 → ANTI-Mxx.md 기록
□ 완성 파일 git commit
□ TOOL-REVIEW.md 라이선스 이슈 있으면 체크박스 업데이트
```
