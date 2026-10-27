# AGENTS.md — RestoSync Sub-Agent Structure
> Sub-agents for delegation. Token monitor visualises which agent is active.
> v3 — 2026-05 — sub-agent set 완성 (이전 v2는 2개만 있었음)

---

## 🤖 Agent set (7 — 6 baseline + 1 RestoSync 전용)

| Agent | Trigger | Tools | 정의 파일 |
|---|---|---|---|
| **schema-keeper** | DB/enum/migration 변경 | Read, Edit, Write, Bash(drizzle-kit *) | `.claude/agents/schema-keeper.md` |
| **route-builder** | Backend route + zod + integration test | Read, Edit, Write, Bash(test) | `.claude/agents/route-builder.md` |
| **ui-builder** | Frontend screen + Zustand + WS hook | Read, Edit, Write, Bash(filter app) | `.claude/agents/ui-builder.md` |
| **test-runner** | Stop hook (변경 워크스페이스 vitest) | Bash(test), Read | `.claude/agents/test-runner.md` |
| **anti-recorder** | 오류 수정 후 ANTI-Mxx.md 기록 | Read, Edit | `.claude/agents/anti-recorder.md` |
| **md-keeper** | .md 자동 갱신 (idempotent) | Read, Edit, Bash(git diff) | `.claude/agents/md-keeper.md` |
| **pr-reviewer** | git commit 직전 diff 검토 | Read, Bash(git diff) | `.claude/agents/pr-reviewer.md` |

---

## 🔄 CLAUDE.md flow

```
SessionStart
  ↓ load CLAUDE.md → ANTI-GLOBAL → ANTI-Mxx → CLAUDE-Mxx
Plan (CLAUDE-Mxx Step N)
  ↓ delegate to <agent>
PreToolUse hook → AG-013 enum check + AG-017 pkg whitelist (block on fail)
  ↓
PostToolUse hook → format + typecheck (exit 2 = auto-fix)
  ↓
Stop hook → test-runner agent (exit 2 = continue)
  ↓ (on error) anti-recorder agent
Update CLAUDE-Mxx "Current Status" → md-keeper agent → git commit
git commit pre hook → pr-reviewer agent
```

---

## 🔗 Module dependency graph

```
        ┌───────────┐
        │ M05 API   │ ← 모든 클라이언트가 의존
        └─────┬─────┘
              │ WS / REST
   ┌──────────┼──────────────┬──────────┐
   ↓          ↓              ↓          ↓
┌──────┐  ┌──────┐       ┌──────┐   ┌──────┐
│ M01  │  │ M02  │       │ M03  │   │ M04  │
│ Menu │  │ Pick │       │Event │   │ Tab  │
└──────┘  └──────┘       └──────┘   └──┬───┘
                                       │ controls
                                       ↓
                                 (M01,M02,M03)
```

Build order (Phase 1): **M05 → M02 → M04 → M01 → M03**
- M05 먼저 완성: API + WS + DB
- M02 (Pickup)이 두 번째: WS 전체 흐름 검증에 최적
- M04 (Tablet)이 세 번째: 운영 시작 가능
- M01, M03은 시각적 가치, 마지막

---

## 🎯 Sub-agent invocation pattern

```
> Spawn <agent-name>.
  Input: <one-line spec>
  Source: CLAUDE-Mxx.md "<section>"
  Output expected: <files + 1-line status>
```

Sub-agent runs in own context → returns minimal report → main context stays light.

**예:**
```
> Spawn schema-keeper.
  Input: orders 테이블에 partial unique index 추가 (AG-018)
  Source: CLAUDE-M05.md "Step 2 — DB 스키마"
  Output expected: schema.ts diff, migration SQL, "✓ schema synced" or "✗ <오류>"
```

---

## 📂 Agent definition file format

```markdown
---
name: <agent-name>
description: <한 줄 설명, 트리거/역할>
tools: <쉼표 구분 도구 목록 — Read, Edit, Write, Bash(pattern *)>
---

# <Agent Name>

## 절대 원칙
- ...

## 작업 절차
1. ...

## 출력 (main으로 반환)
- ...
```

main(orchestrator) 에서 호출 시 sub-agent의 frontmatter `tools`만 사용 가능. 좁은 도구 권한 = 좁은 사고 범위 = 토큰 효율.
