# Repo 이동 가이드: C:\Claude_WOrk_Space\Projects\Apple\Dev\restosync → C:\r\

**목적:** ANTI-M02 [M02-007] 해결책 A — Windows CMake `OBJECT_PATH_MAX=250` 우회.
**작성:** 2026-05-23 (Claude Code 세션 내). 이 파일도 함께 이동됨.

---

## 사전 확인 (이미 통과)

- [x] uncommitted 변경 0건 (ANTI-M02.md M02-007 커밋 완료: `4102509`)
- [x] config 절대경로 하드코드 0건 (`.env`, `babel.config.js`, `turbo.json`)
- [x] hung pnpm/expo/gradle 프로세스 없음 (claude-mem MCP 3개만 외부 경로)
- [x] `.git/*.lock` 없음

---

## 1. Claude Code 종료

이 세션을 먼저 종료. (Ctrl+C 또는 `/exit`)
IDE(VSCode/Cursor 등)도 이 폴더를 열고 있다면 모두 닫는다.

## 2. node_modules / 빌드 산출물 정리 (권장)

이동 전에 삭제하면:
- 이동 속도 ↑ (수십만 심볼릭 링크 제거)
- pnpm 스토어 링크 깨질 가능성 차단
- 신규 경로에서 clean install로 일관성 확보

```powershell
# PowerShell (관리자 권한 불필요)
$repo = "C:\Claude_WOrk_Space\Projects\Apple\Dev\restosync"
Get-ChildItem -Path $repo -Recurse -Force -Directory -Include node_modules,.expo,dist,.cxx,build | `
    ForEach-Object { Write-Host "Removing $($_.FullName)"; Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
```

> ⚠ pnpm 스토어 자체(`C:\Users\hgpar\AppData\Local\pnpm\store`)는 건드리지 않음. 재설치 시 캐시 재사용됨.

## 3. 이동 실행

```powershell
# PowerShell — C:\ 루트에서 실행
Move-Item -LiteralPath "C:\Claude_WOrk_Space\Projects\Apple\Dev\restosync" -Destination "C:\r"
```

같은 볼륨(C:) 내 이동이므로 NTFS rename — **즉시 완료** (수 초). 실패 시:
- 파일 핸들 잡힌 프로세스 존재 → `handle.exe` 또는 작업관리자에서 확인
- 권한 문제 → 관리자 PowerShell

## 4. 검증

```powershell
cd C:\r
ls    # apps, packages, .claude, CLAUDE.md 등 보여야 함
git status     # clean, branch master
git log -3 --oneline
```

## 5. 의존성 재설치

```powershell
cd C:\r
pnpm install --force
```

소요: 약 3~5분 (pnpm 캐시 재사용).

## 6. Claude Code 재시작

새 PowerShell 또는 Cursor에서:
```powershell
cd C:\r
claude
```

세션 시작 후 첫 프롬프트:
```
Read in this exact order, no narration:
1. CLAUDE.md
2. anti-patterns/ANTI-GLOBAL.md
3. anti-patterns/ANTI-M02.md
4. modules/CLAUDE-M02.md

Confirm: "Loaded: ✓ M02"

[현재 상태]
- repo 이동 완료: C:\Claude_WOrk_Space\Projects\Apple\Dev\restosync → C:\r
- ANTI-M02 [M02-007] 해결책 A 적용
- pnpm install --force 완료

[다음 작업]
TV Android 빌드 재시도:
1. pnpm --filter @restosync/tv exec expo run:android
2. CMake OBJECT_PATH 경고 사라졌는지 확인 (250자 한계 통과 기대)
3. apk install + KM2 에뮬레이터/실기기 실행 검증
4. 성공 시 ANTI-M02 [M02-007] RESOLVED 마킹 + 커밋

블로커 발생 시:
- 빌드 실패 → 에러 로그 분석, 옵션 B(node-linker=hoisted) 검토
- 성공 후 → SMOKE §7.4~7.5 TV 시연 진행
```

## 7. 사후 정리 (성공 확인 후)

```powershell
# 이 가이드 파일 제거
cd C:\r
git rm MOVE-TO-C-R.md
git commit -m "chore: remove move guide after successful relocation"
```

또한 다음 파일들의 절대경로 참조 일괄 갱신 검토:
- `HANDOFF.md` (참조 경로 안내가 있을 경우)
- `.claude/settings.json` (hook 절대경로가 있다면 — 현재는 상대경로 사용 중)
- 사용자 메모리 (`C:\Users\hgpar\.claude\projects\C--Claude-WOrk-Space-...` 디렉토리명에 경로 포함 — Claude Code가 새 세션 시작 시 자동으로 새 디렉토리 생성, 기존 메모리는 보존됨)

---

**롤백:** 문제 발생 시 `Move-Item C:\r C:\Claude_WOrk_Space\Projects\Apple\Dev\restosync` 로 즉시 복귀.
