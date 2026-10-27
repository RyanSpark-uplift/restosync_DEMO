# PATCH-NOTES — RestoSync v3 (Final-v5)
> Date: 2026-05-09 | Sonnet 4.7 hardening review applied
> Migration from: Final-v4

---

## Summary

v3는 Sonnet 4.7 검토에서 발견된 **6개 Critical**, **8개 Major** 결함을 모두 정정하고
하네스 엔지니어링 스킬 baseline에서 누락되었던 4개 sub-agent + 3개 정책 문서를 추가했습니다.
**개발 시작 가능 상태로 검증 완료.**

---

## 🔴 Critical fixes (P0 — 개발 시작 차단 해소)

| ID | 파일 | 변경 |
|---|---|---|
| C1 | `anti-patterns/ANTI-GLOBAL.md`<br>`.claude/hooks/pre-edit-schema-check.sh` | AG-013 재정의: BullMQ(오류) → Schema enum drift. hook의 AG 번호와 ANTI-GLOBAL 통일. |
| C2 | `CLAUDE.md`, `modules/CLAUDE-M01.md`<br>`.claude/hooks/pre-edit-schema-check.sh` | Daypart **4-value로 통일** (`['breakfast','lunch','dinner','all']`). hook이 6-value 강제하던 버그 제거. |
| C3 | `modules/CLAUDE-M05.md`<br>`anti-patterns/ANTI-GLOBAL.md` AG-012 | HMAC: `JSON.stringify` → **raw body Buffer + crypto.timingSafeEqual**. addContentTypeParser 추가. |
| C4 | `modules/CLAUDE-M02.md`<br>`anti-patterns/ANTI-GLOBAL.md` AG-007 | TTS: `try/await Speech.speak` → **`onError` 콜백** 패턴 (Speech.speak는 void 반환). |
| C5 | `modules/CLAUDE-M02.md` | 8개 한도: state `slice(-8)` → **화면 단계 slice만**. 9번째 주문 시 1번 주문 데이터 손실 방지. |
| C6 | `modules/CLAUDE-M04.md`<br>`anti-patterns/ANTI-GLOBAL.md` AG-005 | PIN 잠금: client React state → **Redis server-side 잠금**. 앱 재시작 우회 차단. |

---

## 🟡 Major fixes (P1/P2 — 운영 전 권장)

| ID | 파일 | 변경 |
|---|---|---|
| M1 | `modules/CLAUDE-M05.md` (schema)<br>AG-008 | TV pairing: `pairing_expires_at` (10분) + partial unique index 추가 |
| M2 | `modules/CLAUDE-M05.md` (schema)<br>AG-018 (신규) | `orders` 활성 주문 partial unique on (store_id, display_number) |
| M3 | `modules/CLAUDE-M05.md` (schema)<br>AG-006 | `refresh_tokens` 테이블 + Redis revocation set 패턴 |
| M4 | `modules/CLAUDE-M05.md`<br>AG-019 (신규) | `/webhook/*` 별도 rate limit + HMAC fail IP short-ban |
| M5 | `.claude/hooks/pre-commit-pr-review.sh` | AG-001/AG-003 정규식 좁힘 — 정상 코드 오탐 감소. BullMQ 경고 제거 (MIT). |
| M6 | `.claude/agents/` | 누락된 sub-agent 4종 추가: schema-keeper, route-builder, ui-builder, md-keeper, test-runner |
| M7 | (top-level) | 신규 문서: `AGENTS.md`, `MD-MAINTENANCE.md`, `MARKET-STRATEGY-UPDATE.md` |
| M8 | `.claude/hooks/pre-bash-pkg-guard.sh` (신규)<br>AG-017 (신규) | 패키지 화이트리스트 — TOOL-REVIEW.md 미등재 패키지 설치 차단 |

---

## 🟢 ANTI-GLOBAL.md AG 변경 사항 (요약)

| AG | v2 | v3 |
|----|----|----|
| AG-005 | PIN bcrypt 만 | + server-side Redis 잠금 |
| AG-006 | dual token 만 | + jti + revocation list |
| AG-007 | try/catch | onError 콜백 (정정) |
| AG-008 | 6자리 코드 만 | + 만료 + partial unique |
| AG-012 | JSON.stringify body | raw body + timingSafeEqual (정정) |
| AG-013 | ~~BullMQ BSL~~ (오류) | Schema enum drift (재정의) |
| **AG-017** | — | 패키지 화이트리스트 (신규) |
| **AG-018** | — | 매장별 복합 unique (신규) |
| **AG-019** | — | Webhook DoS 보호 (신규) |

---

## 🛠️ Tool Review 변경

`TOOL-REVIEW.md [TR-003]`:
- **이전(v2):** "BullMQ ⚠️ BSL 1.1, SaaS 제한"
- **현재(v3):** "BullMQ ✅ MIT" — 사실 정정. SaaS 사용 자유.
- **선택:** BullMQ(Redis 활용 + 풍부) 또는 pg-boss(PG 단일) — 둘 다 MIT, 기술 선호로만 결정.

---

## 📁 신규 파일 목록

```
restosync-claude-code/
├── AGENTS.md                          ← NEW (sub-agent 인벤토리 + flow)
├── MD-MAINTENANCE.md                  ← NEW (.md 자동 갱신 정책)
├── MARKET-STRATEGY-UPDATE.md          ← NEW (시장 데이터, 90일 refresh)
├── PATCH-NOTES.md                     ← NEW (이 파일)
├── .claude/
│   ├── agents/
│   │   ├── md-keeper.md               ← NEW
│   │   ├── route-builder.md           ← NEW
│   │   ├── schema-keeper.md           ← NEW
│   │   ├── test-runner.md             ← NEW
│   │   └── ui-builder.md              ← NEW
│   └── hooks/
│       └── pre-bash-pkg-guard.sh      ← NEW (AG-017)
└── anti-patterns/
    ├── ANTI-M02.md                    ← 사전 등록 (M02-001 TTS, M02-002 8 한도)
    ├── ANTI-M04.md                    ← 사전 등록 (M04-001 PIN 잠금)
    └── ANTI-M05.md                    ← 사전 등록 (M05-001~005)
```

---

## 🚀 다음 액션

1. **이 zip을 RestoSync 프로젝트 루트에 덮어쓰기**
   ```cmd
   xcopy restosync-claude-code\* C:\path\to\restosync\ /E /H /Y
   ```

2. **변경 hook 권한 확인**
   ```bash
   chmod +x .claude/hooks/*.sh
   ```

3. **Claude Code 첫 메시지 (변경 없음 — HANDOFF.md 그대로)**
   ```
   Read these in order, no narration:
   1. CLAUDE.md
   2. anti-patterns/ANTI-GLOBAL.md   (v3, 19 AGs)
   3. anti-patterns/ANTI-M05.md      (사전 등록 5건 포함)
   4. modules/CLAUDE-M05.md          (v3, HMAC raw body, schema 강화)

   Confirm: "Loaded ✓"
   Start M05 Step 1.
   ```

4. **검증 — hook 작동 확인 (1회)**
   ```bash
   # AG-013 daypart 차단
   echo '{"tool_input":{"path":"enums.ts","new_str":"daypart: [\"brunch\"]"}}' | \
     .claude/hooks/pre-edit-schema-check.sh
   # → 🛑 AG-013: Daypart enum is 4-value

   # AG-017 패키지 차단
   echo '{"tool_input":{"command":"pnpm add malicious-pkg"}}' | \
     .claude/hooks/pre-bash-pkg-guard.sh
   # → 🛑 AG-017: 미승인 패키지

   # 정상 패키지 통과
   echo '{"tool_input":{"command":"pnpm add fastify"}}' | \
     .claude/hooks/pre-bash-pkg-guard.sh
   # → exit 0
   ```

---

## 🔄 v4 → v5 Drift 0 보장

이번 v3 패치는 모든 변경을 ANTI-GLOBAL.md + 모듈 문서 + hook + sub-agent에 일관되게 반영했습니다.
hook이 사용하는 AG 번호와 ANTI-GLOBAL의 AG 번호가 **모두 동기화**됨을 확인:

```
AG-013 (ANTI-GLOBAL: Schema enum drift)
  ↔ pre-edit-schema-check.sh: 'preparing'/'toast'/daypart 차단 메시지에 "AG-013:" 사용
  ↔ session-start.sh: 'preparing' 발견 시 "AG-013 violation" 출력

AG-017 (ANTI-GLOBAL: Package whitelist)
  ↔ pre-bash-pkg-guard.sh: 차단 시 "AG-017:" 출력
  ↔ CLAUDE.md Critical Rules + Package Install 섹션에 AG-017 표기

AG-018 (ANTI-GLOBAL: Multitenant unique)
  ↔ CLAUDE-M05.md Step 2 schema 정의에 partial unique 마이그레이션
  ↔ ANTI-M05.md M05-003 사전 등록

AG-019 (ANTI-GLOBAL: Webhook DoS)
  ↔ CLAUDE-M05.md Step 3에 별도 rate limit 코드
  ↔ ANTI-M05.md M05-005 사전 등록
```
