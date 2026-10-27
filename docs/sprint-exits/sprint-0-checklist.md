# Sprint 0 Exit Checklist — M01 Menu Module
> Week 0 · Pre-implementation harness setup + Pickup 안정화
> **Rule:** 본 체크리스트의 모든 항목이 ✅ 되어야 Sprint 1 진입. 미충족 시 Sprint 1 작업 차단.
> **Why:** harness-engineering 패턴 — 구현 코드 작성 *전*에 안티패턴/서브에이전트/훅이 모두 가동되어 있어야 한다.

---

## A. Harness Pre-flight (구현 코드 진입 전 필수)

### A.1 컨텍스트 문서
- [ ] `modules/CLAUDE-M01.md` v3 (PRD v1.2 정본) 확정
- [ ] `anti-patterns/ANTI-M01.md` 시드 8 항목 (AM01-001 ~ AM01-008) 확정
- [ ] `HANDOFF.md` Next session 프롬프트 갱신 (M01 진입 안내)
- [ ] `AGENTS.md` 활성 subagent 목록: @reviewer, @db-architect, @backend-dev, @frontend-dev, @test-writer, @devops, @ui-builder, @route-builder, @schema-keeper, @md-keeper, @anti-recorder, @pr-reviewer

### A.2 Hooks
- [x] `.claude/hooks/pre-edit-schema-check.sh` — additive 6-value `[breakfast,lunch,snack,dinner,late,all]` 허용 + 변형값(`brunch/late_night/morning/evening/all_day` + daypart 컨텍스트 `closed`) 차단 (v4, 2026-05-17 시연 통과)
- [ ] `.claude/hooks/pre-bash-pkg-guard.sh` — TOOL-REVIEW.md 등재 외 `pnpm add` 차단 (AG-017)
- [ ] `.claude/hooks/pre-commit-pr-review.sh` — AG-001/004/009/013/018/021 자동 검사
- [ ] `.claude/hooks/pre-commit-lint-test.sh` — Lint·TypeCheck·Vitest 통과 시만 commit
- [ ] `.claude/hooks/post-edit-typecheck.sh` — 저장 시 auto-fix loop
- [ ] `.claude/hooks/stop-run-tests.sh` — Stop 시 테스트 실패 자동 수정 루프
- [ ] `.claude/hooks/session-start.sh` — Schema enum check OK 메시지 (`✅ Schema enums OK`) 출력

### A.3 정본 동기화 검증
- [ ] `packages/shared/src/enums.ts` + `apps/api/src/db/schema.ts` + `migrations/0006_daypart_add_snack_late.sql` 단일 commit (Sprint 1 S1.3, additive 6-value `[breakfast,lunch,snack,dinner,late,all]`)
- [x] `pre-edit-schema-check.sh` 변형값(`brunch/late_night/morning/evening/all_day/closed`) 차단 시연 통과
- [x] `TOOL-REVIEW.md` 신규 패키지 등재: TR-038 R2, TR-039 exceljs, TR-040 date-fns-tz, TR-041 draggable-flatlist, TR-042 anthropic-sdk, TR-043 openai (조건부)
- [ ] `CLAUDE.md` DB Enums 섹션 갱신 — Daypart `[breakfast,lunch,snack,dinner,late,all]` 정본 반영 (D0 결정)

### A.4 Subagent 동작 검증 (실 invocation 1회씩)
- [ ] `@reviewer` — gap report 1회 생성
- [ ] `@db-architect` — staging DB 백업 명령 시연
- [ ] `@backend-dev` — Pickup 잔여 리스트 추출 시연
- [ ] `@test-writer` — vitest 샘플 실행
- [ ] `@anti-recorder` — `[AM01-NNN]` 자동 등록 동작 확인

---

## B. M02 Pickup 안정화

- [x] AG-021 list endpoint 점검 — 3건 fix 적용 + 회귀 통과 (2026-05-17)
- [x] display_number recycle 매칭 점검 — M04-011 패턴 안전 확인 (UUID-only lookup)
- [x] `docs/dogfooding/template-daily-log.md` 작성 — activation은 Sprint 6 매장 설치 시점
- [ ] M02 P2 polish (font ttf, readyIcon SVG) — Sprint 1과 병행 (블로커 아님)

> **Dogfooding 14일은 Sprint 6 매장 설치 후 시작.** 현재 매장은 운영 중이나 RestoSync 미설치 — MVP 완성 + 매장 설치 후 14일 카운트 개시 (Sprint 6 → Phase 1.5 초반).

---

## C. Sprint 1 진입 준비

- [ ] `docs/sprint-backlogs/sprint-1-M01-backlog.md` S1.1~S1.19 task 확정
- [ ] 각 task에 Owner / Hours / Deps / Exit 4필드 기입 완료
- [ ] Q2/Q4/Q17/Q18 결정 요청 메시지 Ryan에게 전달 → 4건 모두 응답 수령

---

## D. Infrastructure 점검

- [ ] Sprint 1 진입 직전 `git tag sprint-0-baseline` — 마이그레이션 실패 시 코드 baseline 복구점 (1초 작업)
- ~~staging DB 백업~~ → 폐기. 현 DB는 engineer test 데이터만 있어 손실 시 `pnpm --filter api db:seed` 30초로 복구. baseline은 git tag로 보장.
- [x] docker-compose up 로컬 부팅 < 30s (M05 검증 완료)
- [x] `pnpm --filter api test` green — 85/85 (2026-05-17 H3 검증)
- [x] `pnpm tsc --noEmit` clean — tablet + tv (2026-05-17 AG-021 fix 후 회귀 확인)

---

## E. 결정 사항 (Sprint 1 진입 전 Ryan 답변 필요)

Sprint 1 차단 결정 (2026-05-17 확정):
- [x] **D0** — Daypart enum: additive 6-value `[breakfast,lunch,snack,dinner,late,all]`
- [x] **Q2** — Media 저장: **R2** (Phase 2+ S3 전환 안전성 검증됨)
- [x] **Q4** — 가격 변경 중 주문: **미적용** (orders.line_items_snapshot)
- [x] **Q18** — Import partial failure 기본: **lenient**

Sprint 5 진입 전 (D-3):
- [ ] **Q16** — Import 템플릿 포맷 XLSX vs CSV ZIP
- [ ] **Q17** — AI OCR LLM Claude vs GPT (Phase 1.5 Sprint 7-8)
- [ ] **Q20** — 사진 일괄 업로드 ZIP/폴더/클라우드
- [ ] **Q21** — external_id 자동 생성 옵션

Sprint 2 진입 전:
- [ ] **Q15** — Variant 별도 photo

Sprint 4 진입 전:
- [ ] **Q9** — Modifier TV 표시 정책
- [ ] **Q10** — Combo 카드 분리 vs 혼재

Phase 2 진입 전:
- [ ] **Q14** — POS conflict master 정책
- [ ] **Q19** — Web Scrape 자체 vs Apify

> 🟢 Q1/Q3/Q5/Q6/Q7/Q8/Q11/Q12/Q13 — PRD 추천 채택 (이의 없음 → 자동 진행).

---

## Sign-off

| 역할 | 이름 | 날짜 | 서명/이니셜 |
|------|------|------|-------------|
| Product Owner | Ryan | __________ | __________ |
| @reviewer | (agent) | __________ | __________ |
| @devops | (agent) | __________ | __________ |

**Exit 조건:** A·B·C·D·E 5개 섹션 모든 체크박스 ✅ + Ryan 서명 → Sprint 1 kickoff.
