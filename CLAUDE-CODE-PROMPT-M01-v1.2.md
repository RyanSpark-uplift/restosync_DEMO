# Claude Code 전달 프롬프트 — RestoSync M01 v1.2

> 이 문서는 두 부분으로 구성됩니다:
> **Part A** — Claude Code에 처음 전달할 Kickoff Prompt (복사 → 붙여넣기)
> **Part B** — Sprint 1 진입 후 매 Sprint마다 사용할 반복 Prompt 템플릿

---

# Part A — Kickoff Prompt (Claude Code 첫 세션)

다음 내용을 그대로 Claude Code에 붙여넣으세요. 첨부 파일: `PRD-M01-Menu-Module-v1.2.md`

---

```
@PRD-M01-Menu-Module-v1.2.md 를 첨부합니다.

## Context
- 프로젝트: RestoSync (Restaurant Integrated Display System)
- 본 PRD는 M01 Menu Module v1.2 — Menu Import 5-paths + 12주 Sprint Plan 포함
- 현재 Pickup 모듈(M02) 90% 완성, API 서버 + Tablet App 운영 중
- harness-engineering 방법론 적용 — CLAUDE.md 계층, ANTI-패턴, Subagent 위임, .claude/hooks 자동 검증

## 즉시 수행 (Phase: Sprint 0 — Week 0, 준비)

### Step 1. 기존 자산 audit
@reviewer 를 spawn 해서 다음 항목 확인 후 1-page gap report:
- apps/api/src/db/schema.ts 현 상태 (이미 menu_items, stores, tv_screens 존재)
- packages/shared/src/enums.ts 현 상태 (DAYPART 6개 정본 여부 확인)
- 현재 정의된 WS event 채널 (display:* prefix 사용 여부)
- M02 Pickup의 잔여 10% bug list

### Step 2. M01 CLAUDE 컨텍스트 생성
첨부된 PRD v1.2를 기반으로 다음 두 파일을 생성:

**A. modules/CLAUDE-M01.md** — Claude Code 세션 컨텍스트
필수 포함:
- 5개 Pages 스펙 (Dashboard/Edit/Categories/Daypart/Import Wizard)
- 5-Zone TV 렌더 정책 + Multi-Zone 통합 정책
- API 엔드포인트 카탈로그 (Menu CRUD + Import 11개)
- WebSocket 이벤트 8개 (display:menu_item_*, display:daypart_changed, display:full_refresh, display:config_changed)
- DB 스키마 변경 요약 (5 테이블 신규/확장 + 0010~0024 migration 순서)
- Business Rules 25개 (BR-01~BR-15 + BR-16~BR-24 + BR-25~BR-34)
- D1~D9 차별화 9개와 각 Phase 할당
- 6-Daypart 정본 (breakfast/lunch/snack/dinner/late/closed)
- 다국어 정본 (en/ko/es/zh/ja, default en)
- 가격은 항상 cents (BR-01), Excel 입력만 dollars → 서버 cents 변환 (BR-25)
- 시간은 항상 UTC + stores.timezone 적용 (BR-02)

**B. anti-patterns/ANTI-M01.md** — M01 한정 안티패턴
다음 시드 항목 + 개발 중 발견되는 모든 안티패턴 누적:
- [AM01-001] 가격을 float/decimal로 DB 저장 — BR-01 위반. 항상 integer cents.
- [AM01-002] daypart 이름을 enum 외 자유 문자열로 저장 — DAYPART 정본 외 입력 거부.
- [AM01-003] external_id를 store 간 unique로 검증 — store 내만 unique (BR-26).
- [AM01-004] Import 트랜잭션을 별도로 분할 — 전체 1 transaction이거나 row-level partial fail (BR-31).
- [AM01-005] 사진 트랜스코딩 중 메인 API thread 점유 — BullMQ worker로 분리.
- [AM01-006] WS broadcast 전 DB commit 누락 — read-after-write inconsistency. commit 후 broadcast.
- [AM01-007] TV 클라이언트 daypart 계산을 UTC로 — 매장 timezone 적용 필수.
- [AM01-008] 86 토글이 일반 PATCH endpoint와 같은 권한 검사 — kitchen 역할도 86만 가능해야 함.

### Step 3. Sprint 1 Backlog 확정
PRD Section 19.2의 S1.1~S1.19를 .claude/todos.md 또는 GitHub Project로 변환.
각 task에 명시:
- 소요 시간 (PRD 명시값)
- 담당 Subagent (@backend-dev, @db-architect, @test-writer, @reviewer)
- Dependency (선행 task)
- Exit criteria

### Step 4. Pickup 잔여 작업 리스트
@backend-dev 를 spawn 해서:
- M02 Pickup 모듈의 P1/P2 잔여 이슈 추출
- Sprint 0 내 완료 가능한 것만 분리
- 본인 매장 dogfooding 14일 계획 (Sprint 6과 병행)

### Step 5. Sprint 0 Exit 확인 체크리스트 생성
다음 파일 생성: docs/sprint-exits/sprint-0-checklist.md
- [ ] Pickup 100% 안정 (4주 무중단 dogfood 시작 가능)
- [ ] modules/CLAUDE-M01.md 작성 완료
- [ ] anti-patterns/ANTI-M01.md 시드 8개 + 발견 항목
- [ ] Sprint 1 백로그 19 task 확정
- [ ] staging DB 백업 완료 (날짜 명시)

## 의사결정 즉시 필요 (Sprint 1 진입 전)

다음 4가지 결정사항을 Sprint 0 종료 전 사용자(Ryan)에게 확인:
- Q2: 사진 저장 — R2 vs S3 (PRD 추천: R2)
- Q4: 가격 변경 중 진행 주문 적용 여부 (PRD 추천: 미적용)
- Q17: AI OCR LLM — Claude 3.5 Sonnet vs GPT-4o (PRD 추천: Claude)
- Q18: Import partial failure 기본 — strict vs lenient (PRD 추천: lenient)

각 질문에 대한 영향 분석 1-2문장씩 첨부해서 결정 요청 메시지 작성.

## 운영 규칙 (모든 Sprint 공통)

1. **Brief output** — Claude Code 응답은 최소 형식. 변경 요약 + 다음 단계만. 장황 금지.
2. **Subagent 위임 우선** — DB는 @db-architect, API는 @backend-dev, UI는 @frontend-dev, 테스트는 @test-writer, 코드리뷰는 @reviewer. 메인 컨텍스트는 조율만.
3. **ANTI 패턴 자동 누적** — 버그 fix 또는 PR 리뷰에서 발견된 안티패턴은 즉시 ANTI-Mxx.md에 [AMxx-NNN] 형식으로 추가.
4. **MD 자동 유지** — 모든 .md 파일 (CLAUDE.md, AGENTS.md, ANTI-*.md, 모듈 CLAUDE-*.md) 은 PR 머지 시 자동 동기화. hook에서 검증.
5. **Hook 통과 필수** — auto-format / auto-typecheck / auto-test / schema-enum-guard / dangerous-bash-block 모두 통과해야 commit 진행.
6. **본인 매장 보안 규칙** — 코드/문서/seed 어디에도 Demo Store A 또는 Apple 같은 개인 식별 정보 절대 영구 포함 금지. 데모 데이터는 generic ("Demo Store A") 사용.

## 다음 응답에서 제공해야 할 것

1. Step 1의 gap report (1 page, bullet 형식)
2. Step 2의 두 파일 (modules/CLAUDE-M01.md, anti-patterns/ANTI-M01.md) 초안
3. Step 3의 Sprint 1 백로그 (markdown 테이블)
4. Step 4의 Pickup 잔여 작업 리스트
5. Step 5의 Sprint 0 체크리스트
6. Q2/Q4/Q17/Q18 결정 요청 메시지

모든 산출물은 Brief 형식 + 다음 액션 1문장 명시.
시작하세요.
```

---

# Part B — Sprint 진입 반복 Prompt (Sprint 1~6)

각 Sprint 시작 시 사용. Sprint 번호와 backlog만 바꿔서 사용.

## B-1. Sprint 1 시작 Prompt (DB + Core API)

```
Sprint 1 — DB Schema + Core API 시작합니다.

## 사전 확인
- @PRD-M01-Menu-Module-v1.2.md Section 19.2 참조
- modules/CLAUDE-M01.md, anti-patterns/ANTI-M01.md 로드
- 의사결정 Q2/Q4/Q17/Q18 답변 반영

## 실행 순서

### 1. DB 마이그레이션 (@db-architect)
S1.1~S1.6 순차 실행. 각 마이그레이션은 별도 파일:
- 0010_menu_categories.sql
- 0011_menu_items_extend.sql  
- 0012_menu_dayparts.sql
- 0013_menu_audit_log.sql
- 0014_stores_i18n.sql
- 0015_menu_partial_indexes.sql

각 .sql 파일에 up + down 스크립트 모두 필수.
staging 적용 후 EXPLAIN ANALYZE로 TV-visible 쿼리 < 20ms 확인 (seed 1000 items).

### 2. Shared layer (@backend-dev)
- packages/shared/src/enums.ts에 DAYPART, ALLERGEN, SPICE_LEVEL, ITEM_STATUS, SUPPORTED_LANG 정본 (S1.7)
- packages/shared/src/menu.schema.ts에 Zod 스키마 (S1.8)
- 정본 위치는 단일 — 다른 곳에서 enum 하드코딩 발견 시 ANTI-M01 추가

### 3. API Routes (@backend-dev)
순서대로 구현 (각 단계 후 hook 통과 확인):
- S1.9 GET /api/menu/items (filter: daypart, category, status, lang)
- S1.10 POST /api/menu/items
- S1.11 PATCH /api/menu/items/:id
- S1.12 DELETE /api/menu/items/:id (soft only)
- S1.13 ★ PATCH /api/menu/items/:id/toggle-sold-out (fast-path, < 200ms)
- S1.14 CRUD /api/menu/categories (DELETE 차단 + ?force=true 옵션)
- S1.15 GET/PUT /api/menu/dayparts (시간 겹침 422 검증)

### 4. Audit Middleware (@backend-dev)
S1.16 — 모든 mutation 자동 로그:
- before/after JSON
- field-level diff (jsonb)
- user_id, ip, user_agent 캡처
- DB transaction 내 실행 (broadcast 전 commit 후)

### 5. 테스트 (@test-writer)
- S1.17 Unit tests — coverage ≥ 80% 필수
- S1.18 Integration tests — testcontainers PG real
- 각 BR-01~BR-15 + BR-25~BR-34에 대해 최소 1 test case
- 86 토글 fast-path는 별도 perf test (< 200ms server-side)

### 6. 검토 (@reviewer)
- S1.19 — OpenAPI/Swagger 자동 생성
- 위 모든 task에 대해 ANTI-M01 위반 검사
- 신규 ANTI 패턴 발견 시 즉시 추가

## Exit Criteria (Sprint 1 종료 확인)
다음 모두 통과해야 Sprint 2 진입:
- [ ] 6 migrations applied to staging
- [ ] 모든 API 엔드포인트 curl 정상 응답
- [ ] coverage ≥ 80%
- [ ] EXPLAIN ANALYZE TV-visible 쿼리 < 20ms
- [ ] Audit log row 자동 생성 검증
- [ ] Daypart 시간 겹침 → 422 with explicit message

## 응답 형식
- 각 step 완료 후 1-line status
- Sprint 종료 시 docs/sprint-exits/sprint-1-checklist.md 작성
- 신규 발견 ANTI 패턴은 ANTI-M01.md에 즉시 추가하고 그 사실만 보고

시작하세요.
```

---

## B-2. Sprint 2~6 반복 템플릿

위 Sprint 1 prompt 구조를 그대로 따르되, 다음만 교체:

| Sprint | 제목 | PRD Section | Task ID 범위 | 핵심 Subagent |
|---|---|---|---|---|
| 1 | DB + Core API | 19.2 | S1.1~S1.19 | @db-architect, @backend-dev |
| 2 | Media + WebSocket | 19.3 | S2.1~S2.15 | @backend-dev, @devops, @test-writer |
| 3 | Tablet UI | 19.4 | S3.1~S3.13 | @frontend-dev, @test-writer |
| 4 | TV App 5-Zone | 19.5 | S4.1~S4.17 | @frontend-dev (RN TV), Ryan (device test) |
| 5 | Excel Import | 19.6 | S5.1~S5.18 | @backend-dev, @frontend-dev, @db-architect |
| 6 | Polish + Pilot | 19.7 | S6.1~S6.13 | 전체 + @reviewer (security) |

각 Sprint 시작 시 위 B-1 템플릿을 복제하고 다음 항목만 수정:

```
1. 헤더 "Sprint X — [제목]" 변경
2. PRD Section 참조 변경
3. Task ID 범위 변경
4. 담당 Subagent 변경
5. Exit Criteria를 PRD 해당 Section에서 복사
6. 이전 Sprint 누적 학습 사항 1줄 추가 ("이전 Sprint에서 발견된 ANTI 패턴 N개 적용됨")
```

---

# Part C — 특수 상황별 Prompt 스니펫

## C-1. Sprint 중 막혔을 때 (디버깅)

```
다음 문제가 발생했습니다:

[에러 메시지 또는 증상]

@reviewer 를 spawn 해서:
1. 관련 ANTI-M01 / ANTI-GLOBAL 패턴 검색
2. 동일 패턴이 코드베이스 다른 곳에도 있는지 확인
3. Root cause / Impact / Verification / Recommended action 형식으로 응답

근본 원인 파악 후 fix는 @backend-dev (또는 적절한 agent) 에 위임.
fix 완료 후 신규 ANTI 패턴 [AM01-NNN] 항목 추가.
```

## C-2. Sprint 종료 후 회고

```
Sprint X 종료. 회고 진행합니다.

@reviewer 를 spawn 해서:
1. Exit Criteria 체크리스트 검증 (docs/sprint-exits/sprint-X-checklist.md)
2. 미완료 task → Sprint X+1 백로그로 이동
3. 신규 누적된 ANTI 패턴 카운트
4. 누적 기술 부채 리스트
5. Sprint X+1 진입 가능 여부 GO/NO-GO 판정

응답 형식: 1-page 회고 보고서.
```

## C-3. Phase 1.5 진입 결정

```
Phase 1 MVP 완료 검증.

다음을 확인:
- 본인 매장 14일 무중단 dogfood 로그
- 베타 매장 1곳 계약 + 설치 일정
- 모든 P1 버그 해결
- APM SLA 충족 (p99 < 300ms, TV reflect < 5s)
- Excel 100-item import < 60s 실증

모두 통과 시 Phase 1.5 Sprint 7 (AI OCR + Recipe-Auto-86) 진입.
미통과 항목은 Sprint 6.5 추가 (2주) 계획.
```

## C-4. 의사결정 변경 시

```
다음 의사결정이 변경되었습니다:

[변경 전] Q17: AI OCR LLM = Claude 3.5 Sonnet
[변경 후] Q17: AI OCR LLM = GPT-4o

영향 분석 (@reviewer):
1. 영향받는 task 식별
2. 코드 변경 범위
3. 비용 변화
4. ANTI-M01 또는 CLAUDE-M01.md 업데이트 필요 여부

응답 후 영향 task 백로그 재배치.
```

---

# Part D — 사용 가이드

## D-1. Kickoff Prompt 사용법

1. Claude Code 새 세션 시작
2. `@PRD-M01-Menu-Module-v1.2.md` 파일 첨부
3. Part A의 전체 prompt 그대로 붙여넣기
4. Sprint 0 산출물 검토 → Q2/Q4/Q17/Q18 답변 → Sprint 1 진입

## D-2. Sprint 진입 시

1. 이전 Sprint 종료 회고 (C-2) 완료 확인
2. Part B-1 (Sprint 1) 또는 B-2 템플릿 사용
3. Sprint 종료 시 docs/sprint-exits/sprint-X-checklist.md 갱신

## D-3. 주간 체크포인트

매주 금요일:
- 진행 중 Sprint의 task 진척률
- 누적 ANTI 패턴 카운트 (성장 추이)
- 누적 기술 부채
- 본인 매장 운영 이슈 (Pickup 모듈 dogfood 결과)

## D-4. 토큰 사용 모니터링

`.claude/hooks/token-monitor.sh` 가 자동 추적.
Sprint당 예상 토큰: ~500K (코드 작성 + 테스트 + 리뷰).
임계치 초과 시 알림.

## D-5. 비용 가드

AI OCR Path 2 사용 시:
- Claude 3.5 Sonnet: ~$0.05 / menu page
- 1 import당 max 5 calls = $0.25 한도
- 월 1000 imports = $250 한도

초과 시 Sprint 7 시작 전 가드 로직 강화 (rate limit + 일일 한도).

---

# 부록 — Claude Code 작동 체크

Kickoff 후 첫 응답에서 다음이 모두 보여야 정상 작동:

- [ ] PRD 첨부 파일 인식 ("PRD v1.2 로드됨" 또는 유사)
- [ ] modules/CLAUDE-M01.md 초안 생성 시도
- [ ] @reviewer, @db-architect, @backend-dev 등 Subagent 호출
- [ ] Sprint 0 산출물 5개 모두 생성
- [ ] Brief 응답 형식 준수 (장황 X)
- [ ] 본인 매장 정보 자동 제외 (generic 데모 데이터)

하나라도 누락되면 그 항목만 다시 요청.

---

**End of Claude Code Prompt Package**
