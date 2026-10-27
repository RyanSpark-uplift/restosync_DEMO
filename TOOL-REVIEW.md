# TOOL-REVIEW.md — RestoSync 상용화 Tool 검토
> Sonnet 4.6 검토 | 2026-05 | 상용 서비스 출시 전 반드시 재확인

---

## 판정 기준
- ✅ **OK** — MIT/Apache 2.0 등 상용 허용, 무료 or 합리적 비용
- ⚠️ **주의** — 상용 플랜 필요 or 라이선스 조건 확인 필요
- ❌ **위험** — BSL/GPL/상용 금지 조건 or 고비용 서비스

---

## Phase 1 — 핵심 인프라

### [TR-001] Fastify + 플러그인 ✅ OK
| 패키지 | 라이선스 | 비용 |
|--------|----------|------|
| fastify | MIT | 무료 |
| @fastify/cors, jwt, websocket, multipart | MIT | 무료 |

### [TR-002] Drizzle ORM ✅ OK
- **라이선스:** Apache 2.0
- **비용:** 무료 (오픈소스)
- **상용화:** 제한 없음
- **참고:** `drizzle-kit`(CLI)도 Apache 2.0

### [TR-003] BullMQ ✅ OK ★ v3 정정 (이전 v2의 BSL 표기는 사실 오류)
- **라이선스:** **MIT** (BullMQ 표준 / `bullmq` npm 패키지)
- **비용:** 무료 (오픈소스)
- **상용 SaaS 사용:** 제한 없음
- **참고:** `bullmq-pro`만 별도 상용 라이선스($95/mo) — 표준판으로 충분
- **대안 (선택사항):** Redis 의존을 줄이고 PostgreSQL 단일 백엔드를 원하면 `pg-boss` (MIT)
  - PG 단일 백엔드 / 운영 단순 → pg-boss
  - 고처리량 + 우선순위 큐 + 그룹 → BullMQ
  - **둘 다 라이선스/비용 동일 (MIT, 무료)** → 기술적 선호로만 결정

```typescript
// BullMQ 사용 예
// pnpm add bullmq
import { Queue, Worker } from 'bullmq';
const webhookQueue = new Queue('webhooks', { connection: { host: 'localhost', port: 6379 } });
await webhookQueue.add('process', { orderId, source: 'doordash' });

// pg-boss 사용 예 (대안)
// pnpm add pg-boss
import PgBoss from 'pg-boss';
const boss = new PgBoss(process.env.DATABASE_URL);
await boss.start();
await boss.send('process-webhook', { orderId, source: 'doordash' });
```

### [TR-004] ioredis ✅ OK
- **라이선스:** MIT | **비용:** 무료

### [TR-005] node-cron ✅ OK
- **라이선스:** MIT | **비용:** 무료
- **용도:** 이벤트 자동 전환 스케줄러 (scheduler.ts)
- **주의:** serverless 환경에서는 미작동 → EC2 고정 서버에서만 사용

### [TR-006] bcrypt ✅ OK
- **라이선스:** MIT | **비용:** 무료

### [TR-007] zod ✅ OK
- **라이선스:** MIT | **비용:** 무료

---

## Phase 1 — Expo / React Native

### [TR-008] Expo SDK 51 + Expo Router v3 ⚠️ 주의
- **라이선스:** MIT (SDK 자체)
- **EAS Build 비용:**
  - Free: 월 30 builds (개발/테스트 충분)
  - Production: $99/월 (무제한 빌드) ← **앱스토어 배포 시 필요**
- **상용화 조치:** EAS Build Production 플랜 예산 반영

### [TR-009] Zustand ✅ OK
- **라이선스:** MIT | **비용:** 무료

### [TR-010] TanStack React Query ✅ OK
- **라이선스:** MIT | **비용:** 무료

### [TR-011] expo-secure-store ✅ OK
- **라이선스:** MIT | **용도:** JWT 안전 저장

### [TR-012] expo-sqlite ✅ OK
- **라이선스:** MIT | **용도:** 오프라인 주문 큐

### [TR-013] @gorhom/bottom-sheet ✅ OK
- **라이선스:** MIT | **비용:** 무료

### [TR-014] react-native-qrcode-svg ✅ OK
- **라이선스:** MIT | **용도:** TV 페어링 QR 코드 생성

### [TR-015] @react-native-community/netinfo ✅ OK
- **라이선스:** MIT | **용도:** 오프라인 감지

### [TR-016] expo-av ✅ OK
- **라이선스:** MIT | **용도:** TTS fallback 오디오 재생 (M02)
- **주의:** `expo-speech` + `expo-av` 병행 사용 — TTS 없을 때 MP3 fallback

### [TR-017] react-native-reanimated ✅ OK
- **라이선스:** MIT | **비용:** 무료

---

## Phase 1 — 인프라 서비스

### [TR-018] AWS S3 + CloudFront ✅ OK
- **비용:** Pay-per-use
  - S3: ~$0.023/GB/월 (이미지 100GB = ~$2.3/월)
  - CloudFront: ~$0.0085/GB (CDN)
- **상용화:** 문제 없음, 스토어별 S3 prefix로 데이터 격리

### [TR-019] AWS EC2 ✅ OK
- **비용:** t3.small ~$16.6/월 (On-Demand), ~$10/월 (Reserved)
- **상용화:** 문제 없음

### [TR-020] PostgreSQL 16 (AWS RDS) ✅ OK
- **라이선스:** PostgreSQL License (BSD-like)
- **RDS 비용:** db.t3.micro ~$25/월

### [TR-021] Redis 7 (AWS ElastiCache) ✅ OK
- **비용:** cache.t3.micro ~$12/월
- **대안:** Upstash Redis (Serverless, $0~$200) — 소규모 파일럿에 적합

---

## Phase 1 — 외부 연동

### [TR-022] DoorDash Drive API ⚠️ 주의
- **비용:** 무료 (Webhook 수신은 무료, Drive API는 별도 계약)
- **조건:** DoorDash Developer 포털 등록 + Webhook Secret 설정 필수
- **HMAC:** `DOORDASH_WEBHOOK_SECRET` 환경변수 → hmac.ts 검증

### [TR-023] Uber Eats Webhook ⚠️ 주의
- **비용:** 무료 (Webhook 수신)
- **조건:** Uber Eats Developer 포털 등록 + 파트너 계약
- **HMAC:** `UBEREATS_WEBHOOK_SECRET` → hmac.ts 검증

### [TR-024] Toast POS Webhook ⚠️ 주의
- **비용:** Toast 파트너 프로그램 등록 필요
- **조건:** `TOAST_WEBHOOK_SECRET` → hmac.ts 검증
- **Phase 1:** Mock Webhook으로 테스트, 실제 연동은 파트너 승인 후

### [TR-025] Square Webhook ⚠️ 주의
- **조건:** Square Developer 계정 + App 등록
- **비용:** 무료 (Webhook 수신)

### [TR-026] Grubhub Webhook ⚠️ 주의
- **조건:** Grubhub for Restaurants API 파트너 신청 필요
- **Phase 1:** Mock으로 처리, enum만 추가

---

## Phase 1 — 이미지 처리 / 스토리지

## Phase 1 — React Native TV

### [TR-034] @react-native-async-storage/async-storage ✅ OK
- **라이선스:** MIT | **비용:** 무료
- **용도:** TV 앱 AsyncStorage — tv_instance_id, api_url 영속 저장
- **참고:** Tablet은 Expo runtime, TV는 2026-05-22부터 Expo runtime 채택 (Android emulator로 TV 화면 연동 테스트 목적, TR-045~049 참조). expo-secure-store는 여전히 Tablet 전용 — TV는 AsyncStorage 유지.

### [TR-035] expo-speech ✅ OK
- **라이선스:** MIT | **비용:** 무료
- **용도:** 주문 픽업 TTS 알림 (AG-007 onerror 패턴)

### [TR-036] expo-keep-awake ✅ OK
- **라이선스:** MIT | **비용:** 무료
- **용도:** TV 디스플레이 화면 절전 방지

### [TR-037] expo-font ✅ OK
- **라이선스:** MIT | **비용:** 무료
- **용도:** M02 12-theme TV pickup display — 12개 Google Font ttf 번들 로드
- **버전:** `~12.0.10` (Expo SDK 51 호환)
- **참고:** ttf 자체는 Google Fonts (SIL OFL 1.1, 무료 상용 사용 가능). 파일은 `apps/tv/assets/fonts/` 하위에 번들.

---

## Phase 1 — 이미지 처리 / 스토리지

### [TR-031] sharp ✅ OK
- **라이선스:** Apache 2.0 | **비용:** 무료
- **용도:** WebP 변환 (quality 88), 배경제거 후 drop-shadow 합성

### [TR-032] @aws-sdk/client-s3 ✅ OK
- **라이선스:** Apache 2.0 | **비용:** S3 pay-per-use (TR-018 참조)
- **용도:** 메뉴 이미지 S3 업로드, CDN 배포
- **R2 호환 사용 (Q2 확정 — M01 PRD v1.2):**
  ```typescript
  // Cloudflare R2 — S3 API 100% 호환, endpoint만 변경
  new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT, // https://<ACCOUNT_ID>.r2.cloudflarestorage.com
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY!, secretAccessKey: process.env.R2_SECRET_KEY! },
  });
  ```
- **Phase 2+ S3 전환:** endpoint 환경변수 1줄 + `rclone` 데이터 복사로 마이그레이션 (코드 0)

### [TR-033] remove.bg API ⚠️ 주의 (유료 서비스)
- **라이선스:** 상용 API | **비용:** Free 50장/월, Pro $0.20/장~
- **용도:** 메뉴 사진 배경 자동 제거 (imageService.ts)
- **조치:** `REMOVEBG_API_KEY` 환경변수 미설정 시 원본 폴백 자동 적용

---

## Phase 1 — M01 Menu Module 신규 (2026-05-17)

### [TR-038] Cloudflare R2 ✅ OK (Q2 확정)
- **라이선스:** Cloudflare 상용 서비스
- **비용:** 저장 $0.015/GB/월, **egress 무료 (Class A)**, Class B operation $0.36/M
- **호환:** S3 API 100% (TR-032 @aws-sdk/client-s3 그대로 사용)
- **Phase 1 가정:** 매장 1~5곳, 이미지 100GB 미만 → ~$1.5/월
- **Phase 2+ 전환 안전성:** S3 호환 → endpoint 환경변수만 변경 + rclone 복사로 AWS S3 (TR-018) 또는 GCS로 전환 가능 (코드 0)
- **CDN:** Cloudflare CDN 통합 (별도 비용 없음, R2 → public 도메인 자동)

### [TR-039] exceljs ✅ OK
- **라이선스:** MIT | **비용:** 무료
- **용도:** Sprint 5 — Excel 5-sheet 템플릿 생성 + Import 파일 파싱
- **참고:** 다중 시트, 검증 드롭다운, 숨김 시트 모두 지원. SheetJS (xlsx) 대비 활발한 유지보수.

### [TR-040] date-fns-tz ✅ OK
- **라이선스:** MIT | **비용:** 무료
- **용도:** 매장 timezone 변환 (BR-02) — `toZonedTime`, `fromZonedTime`
- **사용처:** Sprint 1 daypart 계산, Sprint 2 cron 매장별 trigger, TV 클라이언트 매분 daypart 체크
- **대안:** Luxon (MIT, 무료) — 둘 다 동일 등급. date-fns-tz는 기존 date-fns와 자연 연동.

### [TR-041] react-native-draggable-flatlist ✅ OK
- **라이선스:** MIT | **비용:** 무료
- **용도:** Sprint 3 Page C 카테고리 드래그 순서, Sprint 3 메뉴 sort_order 편집
- **참고:** RN Reanimated 3 + Gesture Handler 의존 (이미 등재 TR-017, GH는 default Expo SDK 51)

### [TR-042] @anthropic-ai/sdk ⚠️ 주의 (Phase 1.5 Q17 결정 대기)
- **라이선스:** MIT (SDK 자체) | **비용:** API 사용량 기반
- **용도:** Phase 1.5 Sprint 7-8 AI Photo/PDF OCR Import (Claude 3.5 Sonnet Vision)
- **비용 추정:** $3/M input + $15/M output tokens. 메뉴 1장 처리 ≈ $0.05~$0.10
- **가드:** 1 import 당 최대 5 LLM 호출, store당 일일 호출 한도
- **보안:** 24h 임시 S3 (BR-28), prompt injection 분리 (system prompt + user content sanitize)
- **Sprint 진입 전:** Q17 (Claude vs GPT vs 둘 다) Ryan 결정 필요

### [TR-043] openai (선택사항, Q17 fallback) ⚠️ 주의
- **라이선스:** Apache 2.0 (SDK) | **비용:** GPT-4o $2.50/M input + $10/M output
- **용도:** Q17 답변이 "Claude+GPT 듀얼" 또는 "GPT 1차"일 때만 등재
- **조건부 설치** — Q17 결정 후 등재 여부 확정

### [TR-044] @fastify/swagger + @fastify/swagger-ui ✅ OK (2026-05-18, S1.19)
- **라이선스:** MIT | **비용:** 무료
- **용도:** Sprint 1 S1.19 — OpenAPI 3.0 spec 자동 생성 + Swagger UI 브라우저 노출 (`/docs`)
- **참고:** Fastify 공식 ecosystem 플러그인. Zod 스키마를 JSON schema로 자동 변환하는 `fastify-zod`는 보류 (당분간 수동 schema 매핑).
- **운영:** production 환경에서는 `/docs` 라우트 비활성화 또는 admin 인증 뒤로.

### [TR-045] expo (TV runtime) ✅ OK (2026-05-22)
- **라이선스:** MIT | **비용:** 무료 | **버전:** `~51.0.39` (SDK 51, react-native 0.74.5 pin)
- **용도:** TV 앱(`apps/tv`)을 bare RN → Expo runtime으로 마이그레이션. Android emulator 빠른 부팅 + Metro/Hermes 일원화로 TV 화면 연동 테스트 워크플로 단순화.
- **영향:** `expo-speech`/`expo-keep-awake`/`expo-font`(TR-035~037)와 동일 SDK 51 라인. `react-native-svg`는 Expo SDK 51 호환을 위해 15.15.3 → 15.2.0으로 pin.
- **주의:** Expo Web export는 TV 앱 대상 아님 — Android TV 전용 빌드.

### [TR-046] babel-preset-expo ✅ OK (2026-05-22)
- **라이선스:** MIT | **비용:** 무료 | **버전:** `~11.0.15`
- **용도:** TV 앱 `babel.config.js`의 `@react-native/babel-preset` 대체. Expo SDK 51 표준 트랜스파일 + reanimated/worklets 플러그인 호환.
- **참고:** Tablet은 expo-router 자체가 끌어옴. TV는 단독 등재 필요.

### [TR-047] @expo/cli ✅ OK (2026-05-22)
- **라이선스:** MIT | **비용:** 무료 | **버전:** `~0.18.31` (devDep)
- **용도:** TV `pnpm --filter @restosync/tv start` 에서 `expo start` CLI 제공 (Metro + emulator launcher).

### [TR-048] @react-native-community/cli-platform-android ✅ OK (2026-05-22)
- **라이선스:** MIT | **비용:** 무료 | **버전:** `13.6.9` (devDep)
- **용도:** Android emulator 빌드/배포 — `expo run:android`가 내부적으로 호출. RN 0.74 호환 라인 pin.

### [TR-049] @react-native/gradle-plugin ✅ OK (2026-05-22)
- **라이선스:** MIT | **비용:** 무료 | **버전:** `0.74.87` (devDep)
- **용도:** Android native build의 Gradle plugin. RN 0.74.x 라인과 정확히 매칭되어야 함 — 마이너 mismatch 시 `Unable to load script` 류 에러.

---

## Phase 2 — AI 기능 (featureFlag=false로 비활성)

### [TR-027] Runway Gen-4.5 ❌ 고비용 주의
- **라이선스:** 상용, Commercial 플랜 필요
- **비용:** $35+/월 (500 credits), 영상 생성 당 추가 크레딧
- **조치:** Phase 2 예산 별도 책정, featureFlag로 완전 비활성 유지

### [TR-028] Kling 3.0 ❌ 고비용 + 리스크
- **라이선스:** 상용 API (쾌수科技, 중국 기업)
- **비용:** API 크레딧 기반 (가변)
- **리스크:** 미국 서비스로 중국 AI API 사용 시 규제 리스크 검토 필요
- **조치:** Phase 2에서 Runway 또는 Sora API로 대체 검토

### [TR-029] ElevenLabs TTS ⚠️ 주의 (M02 Phase 2)
- **라이선스:** 상용, Commercial 플랜 필요
- **비용:** $5~$99/월 (캐릭터 수 기준)
- **Phase 1 대안:** expo-speech (기기 TTS) + expo-av (MP3 fallback) → 무료
- **조치:** Phase 1은 무료 TTS 사용, Phase 2에서 ElevenLabs 고려

### [TR-030] DALL-E 3 (OpenAI) ⚠️ 주의
- **라이선스:** OpenAI 상용 API (Commercial use OK with paid plan)
- **비용:** $0.040/이미지 (1024×1024 standard)
- **조치:** Phase 2, 생성 이미지 수 제한 로직 필요

---

## 상용화 전 필수 체크리스트

```
[x] TR-003: BullMQ MIT 확인 완료 (v3에서 정정) — pg-boss 교체는 기술적 선호로만 검토
[ ] TR-008: EAS Build Production 플랜 가입 ($99/월)
[ ] TR-022~026: 각 플랫폼 Developer 포털 등록 + Webhook Secret 설정
[ ] TR-027~030: Phase 2 기능 featureFlag=false 확인
[x] TR-038: Cloudflare R2 (Q2 확정 2026-05-17) — Phase 2+ S3 전환 안전
[ ] TR-039~041: M01 Sprint 1~5 진입 시 pnpm add (TOOL-REVIEW 등재 외 설치 금지 — AG-017)
[ ] TR-042~043: Q17 결정 후 단일 SDK or 듀얼 SDK 등재
[ ] hmac.ts: 모든 Webhook HMAC 검증 — raw body + timingSafeEqual (AG-012)
[ ] /webhook/* 별도 rate limit 적용 (AG-019)
[ ] 개인정보처리방침 + 이용약관 작성 (SaaS 서비스 필수)
[ ] PCI-DSS: 카드 데이터 직접 처리 없음 확인 (POS는 외부 처리)
[ ] AG-017: TOOL-REVIEW.md 등재 외 패키지 설치 없음 확인
```

---

## 비용 요약 (월 운영비 추정 — 5개 파일럿 기준)

| 항목 | 월 비용 |
|------|---------|
| EC2 t3.small (API 서버) | ~$17 |
| RDS PostgreSQL t3.micro | ~$25 |
| ElastiCache t3.micro (Redis) | ~$12 |
| S3 + CloudFront (이미지) | ~$5 |
| EAS Build Production | $99 |
| **총합** | **~$158/월** |
| 파일럿 5곳 구독 수입 ($49×5) | **$245/월** |
| **순이익** | **+$87/월** |
