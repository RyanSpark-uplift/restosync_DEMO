# Dogfooding Logs — M02 Pickup 14일 실 운영
> Sprint 0 시작 → Sprint 6 종료까지 병행
> 본인 매장 (generic: "Demo Store A") 일일 30분 체크
> 발견 버그/이슈는 즉시 `anti-patterns/ANTI-M02.md`에 [M02-NNN] 등록

## 작성 방법

매일 영업 종료 후 30분 체크.

1. `docs/dogfooding/template-daily-log.md` → `docs/dogfooding/YYYY-MM-DD.md` 복사
2. 빈칸 채우기 (대부분은 클릭/메모 1줄)
3. UI 이상 발견 시 스크린샷을 `docs/dogfooding/screenshots/YYYY-MM-DD-NN.png`로 저장하고 본문에 링크
4. 매 주말 (일요일) 주간 요약 1단락 추가

## Exit (Sprint 6 종료 시점)

- 14일치 일일 로그 모두 있음
- P1 발견 0건 (또는 모두 fix 완료)
- ANTI-M02 누적 항목 → AG 승격 후보 평가


# RestoSync

Real-time order pickup display system for restaurants. Orders flow from the
ordering channel to a customer-facing display board with live status updates.

**Stack:** Node/Fastify · React Native (tablet, TV) · WebSocket · [DB]
**Built with:** AI-assisted development (Claude Code) — solo design, implementation, and deployment.

> Internal planning docs (CLAUDE.md, HANDOFF.md, modules/) are kept to show the
> AI-assisted development workflow; some are in Korean.

RestroSync Setup Guide
Oct 27, 2026 · @Ryan
Install once, then start the whole stack with a single command. Commands come from the repo's package.json, scripts/start-dev.sh, docker-compose.yml, and .env.example.
Prerequisites
Tool
Version
Note
Node.js
22 or newer
required by the repo's engines field
pnpm
9 or newer
workspace package manager
Docker Desktop
any recent
must be running before setup
First-time setup
Run these once from the repo root. A .env already exists in this checkout, so the copy step can be skipped.
cd /Users/ryanspark/dev/personal/RestroSync-public
pnpm install
cp .env.example .env                    # skip if .env already exists
docker compose up -d                    # postgres:5432 + redis:6379
pnpm db:migrate                         # Drizzle migrations
pnpm --filter @restosync/api db:seed    # seeds demo-store-a
The seed creates the pilot store with one staff user (PIN 1234), five menu items, one event, and three TV screens.
Run for development
One command boots the full stack and opens the browser tabs for you.
pnpm dev:all     # docker → API (:3000) → Tablet Expo Web (:8081) → opens browser tabs
pnpm dev:stop    # stops everything
The launcher waits for the Postgres health check and the API health endpoint before opening the tabs. API and Tablet run in the background with logs in .dev-logs/api.log and .dev-logs/tablet.log.
Run apps individually
Use these when you only need one process, or when debugging a single app.
pnpm --filter @restosync/api dev        # API server only (tsx watch)
pnpm worker                             # BullMQ worker
pnpm --filter @restosync/tablet web     # Tablet (Expo Web)
pnpm --filter @restosync/tv start       # TV app (Expo dev server)
pnpm --filter @restosync/tv android     # TV build on device or emulator
The API and worker both read .env from the repo root via Node's env-file flag. Postgres and Redis must already be up.
URLs
Service
URL
API
http://localhost:3000 (health check at /health)
Tablet (Expo Web)
http://localhost:8081
Pickup TV viewer
http://localhost:3000/tv-view?role=pickup&autoconnect=1
Test and build
pnpm test     # turbo test (API uses vitest)
pnpm build    # turbo build
For a physical TV or tablet, set EXPO_PUBLIC_API_URL in .env to your Mac's LAN IP instead of localhost before starting the Expo app.