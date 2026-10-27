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
