# CLAUDE-M05.md — API Server
> **세션 로드 순서:** CLAUDE.md → ANTI-GLOBAL.md → ANTI-M05.md → 이 파일
> v2 | Sonnet 4.6 검토 — HMAC, node-cron, pg-boss, grubhub 추가

---

## 확정 스택
Node.js 22 LTS · Fastify v4 · Drizzle ORM · PostgreSQL 16 · Redis 7 · node-cron

ℹ️ **Queue 라이브러리:** BullMQ(MIT) 또는 pg-boss(MIT) 중 선택 — 둘 다 라이선스/비용 동일.
TOOL-REVIEW.md [TR-003]에서 결정. 기본은 BullMQ (Redis 활용 + 기능 풍부).

## 전체 파일 구조
```
apps/api/src/
├── server.ts
├── routes/
│   ├── auth.ts
│   ├── orders.ts
│   ├── menu.ts
│   ├── events.ts
│   ├── screens.ts
│   └── webhook.ts        ← AG-012: HMAC 검증 필수
├── ws/
│   ├── handler.ts
│   └── broadcast.ts
├── services/
│   ├── orderService.ts   ← 비즈니스 로직 분리
│   ├── menuService.ts
│   └── scheduler.ts      ← AG-015: node-cron 이벤트 자동 전환
├── middleware/
│   ├── auth.ts           ← JWT 검증
│   └── hmac.ts           ← Webhook HMAC 서명 검증 (AG-012)
└── db/
    ├── schema.ts
    ├── db.ts
    ├── redis.ts
    ├── s3.ts
    ├── migrations/
    └── seed.ts
```

## Step 1 — 패키지 설치
```bash
pnpm add fastify @fastify/cors @fastify/jwt @fastify/websocket @fastify/multipart @fastify/rate-limit
pnpm add drizzle-orm pg ioredis node-cron bcrypt zod
pnpm add -D drizzle-kit tsx typescript @types/pg @types/bcrypt @types/node-cron
# Queue: 둘 중 하나
pnpm add bullmq                # 기본 (MIT)
# 또는: pnpm add pg-boss        # PG 단일 백엔드 원할 때 (MIT)
```

> ⚠ **AG-017 적용:** 위 외 패키지 추가 시 TOOL-REVIEW.md 등재 후 사용자 승인. Hook이 차단.

## Step 2 — DB 스키마 (AG-016, AG-018 반영)
```typescript
// src/db/schema.ts
import { pgTable, uuid, varchar, decimal, boolean, timestamp,
         text, jsonb, pgEnum, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const orderSourceEnum = pgEnum('order_source',
  ['pos','kiosk','manual','doordash','ubereats','grubhub','fantuan','hungrypanda']);
export const orderStatusEnum = pgEnum('order_status',
  ['new','prep','ready','collected','cancelled']);
export const screenRoleEnum = pgEnum('screen_role',
  ['menu','pickup','event','ai_ads']);
export const eventTypeEnum = pgEnum('event_type',
  ['happy_hour','live_event','lto','alert','promo']);
export const daypartEnum = pgEnum('daypart',
  ['breakfast','lunch','dinner','all']);  // 4-value (M01 통일)

export const stores = pgTable('stores', {
  id:              uuid().primaryKey().defaultRandom(),
  name:            varchar({ length: 80 }).notNull(),
  slug:            varchar({ length: 40 }).unique().notNull(),
  license_key:     varchar({ length: 30 }).unique(),
  timezone:        varchar({ length: 50 }).default('America/Los_Angeles'),
  pos_type:        varchar({ length: 20 }),
  subscription_tier: varchar({ length: 20 }).default('basic'),
  brand_color:     varchar({ length: 7 }).default('#E8450A'),
  logo_url:        text(),
  created_at:      timestamp().defaultNow(),
});

export const users = pgTable('users', {
  id:               uuid().primaryKey().defaultRandom(),
  store_id:         uuid().notNull().references(() => stores.id),
  name:             varchar({ length: 40 }).notNull(),
  pin_hash:         varchar({ length: 60 }).notNull(),
  role:             varchar({ length: 20 }).default('staff'),
  // AG-005: 잠금은 Redis에서 처리, DB에는 누적 통계만 (선택)
  total_failed_logins: integer().default(0),
  last_login_at:    timestamp(),
  created_at:       timestamp().defaultNow(),
});

// AG-006: refresh token 폐기 목록 (Redis와 함께 영구 백업)
export const refresh_tokens = pgTable('refresh_tokens', {
  jti:        uuid().primaryKey(),
  user_id:    uuid().notNull().references(() => users.id),
  store_id:   uuid().notNull().references(() => stores.id),
  issued_at:  timestamp().defaultNow(),
  expires_at: timestamp().notNull(),
  revoked_at: timestamp(),         // null = 활성, not null = 폐기됨
  revoke_reason: varchar({ length: 30 }),  // 'logout' | 'rotate' | 'admin' | 'suspicious'
}, (t) => ({
  byUser:   index('rt_user_idx').on(t.user_id),
  notExpired: index('rt_active_idx').on(t.expires_at),
}));

export const orders = pgTable('orders', {
  id:             uuid().primaryKey().defaultRandom(),
  store_id:       uuid().notNull().references(() => stores.id),
  display_number: varchar({ length: 10 }).notNull(),
  customer_name:  varchar({ length: 60 }),
  status:         orderStatusEnum().default('new'),
  source:         orderSourceEnum().default('manual'),
  items:          jsonb(),
  external_id:    varchar({ length: 80 }),
  created_at:     timestamp().defaultNow(),
  ready_at:       timestamp(),
  collected_at:   timestamp(),
}, (t) => ({
  // AG-018: 활성 주문(미수령/미취소) 한정 partial unique
  // raw SQL 마이그레이션에서 적용:
  // CREATE UNIQUE INDEX orders_active_dn_uniq ON orders (store_id, display_number)
  //   WHERE status NOT IN ('collected','cancelled');
  storeStatusIdx: index('orders_store_status_idx').on(t.store_id, t.status),
}));

export const menu_items = pgTable('menu_items', {
  id:          uuid().primaryKey().defaultRandom(),
  store_id:    uuid().notNull().references(() => stores.id, { onDelete: 'cascade' }),
  category:    varchar({ length: 40 }),
  name:        varchar({ length: 80 }).notNull(),
  description: text(),
  price:       decimal({ precision: 10, scale: 2 }),
  image_url:   text(),
  available:   boolean().default(true),
  dayparts:    jsonb(),   // ['breakfast','lunch','dinner','all'] subset
  tags:        jsonb(),
  sort_order:  integer().default(0),
  created_at:  timestamp().defaultNow(),
});

// AG-008: 페어링 코드 만료 + 유일성
export const tv_screens = pgTable('tv_screens', {
  id:                  uuid().primaryKey().defaultRandom(),
  store_id:            uuid().notNull().references(() => stores.id),
  role:                screenRoleEnum().notNull(),
  name:                varchar({ length: 40 }),
  pairing_code:        varchar({ length: 6 }),       // null 이면 페어링 완료/대기 아님
  pairing_expires_at:  timestamp(),                  // 발급 후 10분
  last_seen_at:        timestamp(),
  app_version:         varchar({ length: 20 }),
  online:              boolean().default(false),
}, (t) => ({
  // partial unique: pairing_code가 null이 아닐 때만 unique
  // raw SQL 마이그레이션:
  // CREATE UNIQUE INDEX tv_pairing_code_uniq ON tv_screens (pairing_code)
  //   WHERE pairing_code IS NOT NULL;
}));

export const events = pgTable('events', {
  id:          uuid().primaryKey().defaultRandom(),
  store_id:    uuid().notNull().references(() => stores.id),
  title:       varchar({ length: 100 }),
  type:        eventTypeEnum().notNull(),
  image_url:   text(),
  ticker_text: text(),
  start_at:    timestamp(),
  end_at:      timestamp(),
  recurrence:  jsonb(),
  active:      boolean().default(false),
  created_at:  timestamp().defaultNow(),
});
```

**Partial unique index 마이그레이션 (drizzle-kit generate 후 SQL 추가):**
```sql
-- AG-018: 활성 주문 display_number 매장별 unique
CREATE UNIQUE INDEX IF NOT EXISTS orders_active_dn_uniq
  ON orders (store_id, display_number)
  WHERE status NOT IN ('collected','cancelled');

-- AG-008: pairing_code 활성 시 unique
CREATE UNIQUE INDEX IF NOT EXISTS tv_pairing_code_uniq
  ON tv_screens (pairing_code)
  WHERE pairing_code IS NOT NULL;
```

## Step 3 — HMAC Webhook 검증 (AG-012) ★ v3 정정
**핵심 정정:** `JSON.stringify(req.body)` 사용 시 키 순서/공백 차이로 서명 항상 mismatch.
원본 raw body bytes에 서명해야 함. 또한 `===` 비교는 타이밍 공격에 취약.

**(1) server.ts에서 raw body 보존 (Fastify v4):**
```typescript
// src/server.ts (발췌)
import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (req, body, done) => {
    try {
      (req as any).rawBody = body as Buffer;
      done(null, JSON.parse((body as Buffer).toString('utf8')));
    } catch (err) {
      done(err as Error, undefined);
    }
  }
);
```

**(2) middleware/hmac.ts:**
```typescript
// src/middleware/hmac.ts
import crypto from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

export function verifyHMAC(secretEnvKey: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const secret = process.env[secretEnvKey];
    if (!secret) return; // 개발 환경 — skip (프로덕션에서는 반드시 설정)

    const sig = (req.headers['x-signature'] as string) ?? '';
    const raw = (req as any).rawBody as Buffer | undefined;
    if (!raw) {
      return reply.status(400).send({ error: 'NO_RAW_BODY' });
    }

    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(raw)
      .digest('hex');

    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    // 길이 다르면 timingSafeEqual이 throw — 먼저 체크
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      // AG-019: HMAC fail IP 카운트 (Redis)
      const ip = req.ip;
      const failKey = `webhook:fail:${ip}`;
      const fails = await req.server.redis.incr(failKey);
      if (fails === 1) await req.server.redis.expire(failKey, 3600);
      if (fails >= 5) {
        await req.server.redis.set(`webhook:ban:${ip}`, '1', 'EX', 3600);
      }
      return reply.status(401).send({ error: 'INVALID_SIGNATURE' });
    }
  };
}

// webhook.ts 적용
app.post('/webhook/doordash', { preHandler: verifyHMAC('DOORDASH_WEBHOOK_SECRET') }, handler);
app.post('/webhook/ubereats', { preHandler: verifyHMAC('UBEREATS_WEBHOOK_SECRET') }, handler);
app.post('/webhook/pos',      { preHandler: verifyHMAC('TOAST_WEBHOOK_SECRET') }, handler);
app.post('/webhook/grubhub',  { preHandler: verifyHMAC('GRUBHUB_WEBHOOK_SECRET') }, handler);
```

**(3) Rate limit 분리 (AG-019):**
```typescript
// /api/* — 100 req/min/IP
await app.register(import('@fastify/rate-limit'), {
  global: false,    // 라우트별로 적용
  max: 100,
  timeWindow: '1 minute',
});

// /webhook/* 별도 — 1000 req/min/IP + ban 체크
app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/webhook/')) return;
  const banned = await app.redis.get(`webhook:ban:${req.ip}`);
  if (banned) return reply.status(429).send({ error: 'BANNED' });
});
```

## Step 4 — node-cron 이벤트 스케줄러 (AG-015)
```typescript
// src/services/scheduler.ts
import cron from 'node-cron';
import { db } from '../db/db.js';
import { events } from '../db/schema.js';
import { eq, and, lte, gte, sql } from 'drizzle-orm';
import { broadcast } from '../ws/broadcast.js';

export function startScheduler() {
  // 1분마다 이벤트 시작/종료 체크
  cron.schedule('* * * * *', async () => {
    const now = new Date();

    // 시작해야 할 이벤트
    const toStart = await db.select().from(events)
      .where(and(eq(events.active, false), lte(events.start_at, now)));
    for (const event of toStart) {
      await db.update(events).set({ active: true }).where(eq(events.id, event.id));
      broadcast(event.store_id, 'display:event_push', event);
    }

    // 종료해야 할 이벤트
    const toEnd = await db.select().from(events)
      .where(and(eq(events.active, true), lte(events.end_at, now)));
    for (const event of toEnd) {
      await db.update(events).set({ active: false }).where(eq(events.id, event.id));
      broadcast(event.store_id, 'display:event_clear', { event_id: event.id });
    }
  });
}

// server.ts에서 호출
// startScheduler();
```

## Step 5 — 에러 응답 표준화 (UX-AUDIT)
```typescript
// server.ts
app.setErrorHandler((error, req, reply) => {
  const statusCode = error.statusCode ?? 500;
  reply.status(statusCode).send({
    error: error.code ?? 'INTERNAL_ERROR',
    message: error.message,
    statusCode,
  });
});
```

## 환경변수 (.env.example)
```
DATABASE_URL=postgresql://rs_user:rs_pass@localhost:5432/restosync
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-this-to-random-256bit-string
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:8081,http://localhost:3001

# AWS
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=restosync-media-dev
AWS_CLOUDFRONT_DOMAIN=cdn.restosync.com
AWS_REGION=us-east-1

# Webhooks (개발: 빈 값 허용, 프로덕션: 필수)
TOAST_WEBHOOK_SECRET=
DOORDASH_WEBHOOK_SECRET=
UBEREATS_WEBHOOK_SECRET=
GRUBHUB_WEBHOOK_SECRET=
SQUARE_WEBHOOK_SECRET=
```

## 완료 체크리스트
- [ ] Docker Compose (PG 16 + Redis 7) 기동
- [ ] Drizzle 스키마 → migrate → seed (grubhub/fantuan/hungrypanda enum 포함, daypart 4-value)
- [ ] **Partial unique indexes 마이그레이션 (AG-008, AG-018)**
- [ ] **refresh_tokens 테이블 생성 (AG-006)**
- [ ] GET /health 응답
- [ ] POST /api/auth/login → JWT 발급 + **server-side 잠금 (Redis, AG-005)**
- [ ] **JWT jti + revocation (AG-006)** — login/refresh/logout 모두 jti 검증
- [ ] **Raw body parser (addContentTypeParser, AG-012)**
- [ ] HMAC 검증 middleware/hmac.ts — **timingSafeEqual + raw body (AG-012)**
- [ ] Rate Limiting 분리 — `/api/*` 100/min, `/webhook/*` 1000/min (AG-019)
- [ ] HMAC 실패 IP short-ban (AG-019)
- [ ] Orders CRUD + WS broadcast
- [ ] WebSocket handler (store_id별 Map)
- [ ] Menu CRUD + item toggle + S3 upload
- [ ] Events CRUD + /api/events/active
- [ ] node-cron scheduler.ts (AG-015) → display:event_push/clear
- [ ] **Screens pair endpoint — 만료 검증 + pairing_code NULL 처리 (AG-008)**
- [ ] Webhook routes (doordash, ubereats, pos, grubhub) + HMAC
- [ ] 에러 응답 표준화 (setErrorHandler)
