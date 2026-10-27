# MD-MAINTENANCE.md — Markdown Auto-Update Policy
> Claude Code 작업 중 .md 파일들이 **stale해지지 않도록** 자동 갱신되는 규칙.
> Hook + sub-agent (`md-keeper`) + main Claude의 합작.

---

## 🎯 원칙

1. **모든 md는 살아있는 문서** — 코드만 갱신하고 md를 그대로 두면 정책 위반입니다.
2. **갱신 책임 분리** — hook은 자동 추가/append, sub-agent는 의미 있는 정리, main은 큰 결정.
3. **충돌 방지** — md를 동시에 두 곳에서 쓰지 않기. trigger마다 정해진 단일 writer.
4. **diff 가시성** — 모든 md 변경은 git에 보이게 하고 token-monitor에도 기록.

---

## 📋 갱신 매트릭스 (어떤 trigger → 어떤 md → 어떤 방식)

| md 파일 | Trigger | 갱신 방식 | 누가 |
|---|---|---|---|
| `CLAUDE.md` | 스택 변경, 새 enum, 새 endpoint 추가 | manual 권한 (사용자 확인 후 main) | main + 사용자 승인 |
| `CLAUDE-Mxx.md` "Current Status" | Step 완료 시 (Stop hook 통과) | append 1-3 lines | hook → md-keeper |
| `ANTI-Mxx.md` | typecheck/test 실패 후 수정 완료 시 | `[Mxx-NNN]` 항목 append | anti-recorder agent |
| `ANTI-GLOBAL.md` | 같은 패턴이 2+ 모듈에서 발생 시 | `[AG-NNN]` 항목 append + 사용자 승인 | main 제안 → 사용자 승인 |
| `HANDOFF.md` | SessionEnd hook | 최근 세션 요약 + next 세션 prompt | hook 자동 |
| `TOKEN-MONITOR.md` | 모듈 budget 초과 시 | budget 표 갱신 + warning 기록 | hook 자동 |
| `MARKET-STRATEGY-UPDATE.md` | 90일 경과 또는 사용자 요청 | web_search 후 표 갱신 | main + 사용자 |
| `AGENTS.md` | 새 sub-agent 추가 시 | agent 표 + flow diagram 갱신 | main + 사용자 |
| `README-QUICK-START.md` | 셋업 절차 변경 시 | 사용자 요청만 | manual |
| `MD-MAINTENANCE.md` | 이 정책 자체 변경 시 | manual | manual |

---

## 🔁 갱신 흐름 (시점별)

### A. PostToolUse(Edit|Write) → 코드 변경 시
```
Edit/Write
  ↓ post-edit-format.sh
  ↓ post-edit-typecheck.sh
  ↓ post-edit-md-touch.sh    ← 신규: 변경된 코드 영역 ↔ 관련 md 매핑 후 stale 표시
  ↓ token-monitor.sh
```

`post-edit-md-touch.sh`는:
- `.ts/.tsx` 변경 → 해당 모듈의 `CLAUDE-Mxx.md` "Last code change" 타임스탬프만 갱신
- `schema.ts` 변경 → `CLAUDE.md` "DB 스키마" 섹션에 ⚠️ "schema modified — review needed" 마커 (사람이 갱신해야 함을 알림)
- 자동으로 코드를 md에 복사하지 **않음** — 의도된 정리는 main이 하도록

### B. Stop hook → Step/Module 완료 시
```
stop-run-tests.sh
  ↓ tests pass
  ↓ stop-md-update.sh        ← 신규: CLAUDE-Mxx.md "Current Status" 1-3줄 append
  ↓ git commit suggestion
```

`stop-md-update.sh`는 `md-keeper` sub-agent를 호출하여:
- `CLAUDE-Mxx.md` "## Current Status" 섹션 마지막에 한 줄 추가:
  ```
  [2026-05-08 18:42] Step 4/9 done — orders route + WS broadcast tested OK
  ```
- 완료 체크리스트 항목 자동 체크 (`- [ ]` → `- [x]`) — 단, 키워드 매칭으로 신중하게

### C. SessionEnd hook → 세션 종료 시
```
session-end.sh
  ↓ summary 출력
  ↓ session-end-md.sh        ← 신규: HANDOFF.md 자동 갱신
```

`session-end-md.sh`는 `md-keeper` agent를 호출하여:
- `HANDOFF.md` "Last session" 섹션 갱신:
  - 날짜
  - 활성 모듈 (token-log.jsonl에서 추출)
  - 완료된 step (CLAUDE-Mxx.md "Current Status"에서 추출)
  - 토큰 사용량 (token-log.jsonl line count)
  - "Next session — paste this prompt" 블록을 다음 우선순위 모듈로 자동 갱신
- "Last 10 ANTI entries" 자동 요약 (전체 ANTI에서 가장 최근 10개)

### D. anti-recorder agent → 오류 수정 시
```
typecheck/test 실패 → main이 수정 → 통과 → main이 anti-recorder 호출
  ↓ ANTI-Mxx.md에 [Mxx-NNN] 항목 append
  ↓ 같은 root cause가 다른 모듈 ANTI에 있으면 main에게 "AG-NNN 승격 제안" 보고
```

이미 존재하는 `anti-recorder.md`에 정의됨. 변경 없음.

### E. PreCompact hook → context 압축 직전
```
PreCompact 발생
  ↓ pre-compact-md.sh        ← 신규: 잃을 수 있는 정보 md로 dump
```

작업 중인 일시적 결정/근거가 main 컨텍스트에서만 살아있다가 compact로 사라지는 것을 방지:
- 최근 user assistant 메시지에서 "결정", "이유", "선택" 키워드 추출 → `decisions/<timestamp>.md`로 dump
- main이 다음에 다시 읽을 수 있게 `CLAUDE-Mxx.md`에 link만 추가

### F. 90일 timer (cron 또는 manual)
- `MARKET-STRATEGY-UPDATE.md` refresh 알림
- `package.json scripts.rs:market-refresh` 실행 → web_search → 변경 부분만 diff로 보여주고 사용자 승인 후 commit

---

## 🤖 md-keeper sub-agent

새 sub-agent 추가. `.claude/agents/md-keeper.md`에 정의.

역할:
- 특정 md 파일에 정해진 형식으로 한 줄/한 블록 append
- 코드를 md에 복사하지 않음 (의도 왜곡 방지)
- 항상 idempotent — 같은 입력으로 두 번 호출되어도 중복 추가 안 함
- 출력은 `✓ updated: <path> (+N lines)` 한 줄만

---

## ⚠️ 안전 규칙

1. **자동 삭제 금지** — md에서 줄을 자동으로 지우지 않음. 항상 append 또는 mark stale.
2. **사용자 결정 필요한 변경은 자동 금지** — Critical Rules 섹션, Phase 정의, Pricing 등은 main이 사용자에게 묻고 변경.
3. **중복 방지** — md-keeper는 같은 timestamp/같은 NNN으로 두 번 쓰지 않음.
4. **rollback 가능** — 모든 자동 갱신은 git commit 단위로 묶여 한 번에 revert 가능해야 함.
5. **Hook 실패 시 silent** — md 갱신이 실패해도 코드 작업은 멈추지 않음 (`|| true` pattern).

---

## 📊 갱신 가시성 (token-monitor 통합)

`scripts/token-monitor.js`의 "Recent" 섹션에 md 변경이 별도 색으로 표시:
```
18:42:15  Edit            schema.ts
18:42:18  Write           CLAUDE-M05.md  ← magenta (md auto-update)
```

`📝 MD updates` 카운터 추가 (이번 세션에 자동 갱신된 md 파일 수).

---

## 🧪 검증

자동 갱신이 제대로 동작하는지 확인:
```bash
# 1. M05 작업 중 한 step 완료 → CLAUDE-M05.md "Current Status" 1줄 추가됐는지
git diff modules/CLAUDE-M05.md

# 2. 세션 종료 → HANDOFF.md 갱신됐는지
git diff HANDOFF.md

# 3. 오류 수정 후 anti-recorder 호출 → ANTI-M05.md 항목 추가됐는지
git diff anti-patterns/ANTI-M05.md

# 4. token-monitor "MD updates" 카운터가 증가했는지
node scripts/token-monitor.js  # MD updates: 3
```

---

## 📌 사용자가 알아야 할 것

- 작업 중 `git diff *.md`를 가끔 확인하면 자동 갱신 내용 보임
- 자동 갱신이 마음에 안 들면 `git checkout <file.md>`로 되돌리고 정책 수정 (이 파일)
- 큰 변경(섹션 추가, 가격 변경, 파일 구조 개편)은 자동 안 됨 — main에게 명시적 요청 필요
