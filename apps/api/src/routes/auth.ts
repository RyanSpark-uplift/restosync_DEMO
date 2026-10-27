import { randomUUID } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcrypt';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/db';
import { redis } from '../db/redis';
import { users, refresh_tokens, stores } from '../db/schema';
import { authenticate } from '../middleware/auth';
import type { JWTPayload } from '../types';

const ACCESS_TTL = '15m';
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60; // 30일
const PIN_MAX_FAILS = 3;
const PIN_LOCK_SEC = 30;

// ── Zod 없이 Fastify JSON Schema 검증 ────────────────────────────────────────
// 두 가지 입력 허용:
//   A) { store_id, user_id, pin }           — 정식 (onboarding 완료 후)
//   B) { license_key, pin }                  — 테스트/단일사용자 매장 단순화
const loginBody = {
  type: 'object' as const,
  oneOf: [
    {
      required: ['store_id', 'user_id', 'pin'],
      properties: {
        store_id: { type: 'string', format: 'uuid' },
        user_id:  { type: 'string', format: 'uuid' },
        pin:      { type: 'string', minLength: 4, maxLength: 8 },
      },
      additionalProperties: false,
    },
    {
      required: ['license_key', 'pin'],
      properties: {
        license_key: { type: 'string', minLength: 8, maxLength: 64 },
        pin:         { type: 'string', minLength: 4, maxLength: 8 },
      },
      additionalProperties: false,
    },
  ],
};

const refreshBody = {
  type: 'object' as const,
  required: ['refresh_token'],
  properties: {
    refresh_token: { type: 'string' },
  },
  additionalProperties: false,
};

type LoginBody =
  | { store_id: string; user_id: string; pin: string }
  | { license_key: string; pin: string };
interface RefreshBody { refresh_token: string }
interface LogoutBody  { refresh_token: string }

// ── Plugin ────────────────────────────────────────────────────────────────────
const authRoutes: FastifyPluginAsync = async (app) => {

  // POST /api/auth/login
  app.post<{ Body: LoginBody }>('/login', { schema: { body: loginBody } }, async (req, reply) => {
    let store_id: string;
    let user_id:  string;
    const { pin } = req.body;

    if ('license_key' in req.body) {
      // license_key 경로 — 매장 1명 사용자 환경/테스트용
      const [store] = await db
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.license_key, req.body.license_key))
        .limit(1);
      if (!store) return reply.status(401).send({ error: 'INVALID_LICENSE' });
      const [firstUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.store_id, store.id))
        .limit(1);
      if (!firstUser) return reply.status(401).send({ error: 'NO_USERS_IN_STORE' });
      store_id = store.id;
      user_id  = firstUser.id;
    } else {
      store_id = req.body.store_id;
      user_id  = req.body.user_id;
    }

    // AG-001: store_id WHERE 필수
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.store_id, store_id), eq(users.id, user_id)))
      .limit(1);

    if (!user) return reply.status(401).send({ error: 'INVALID_CREDENTIALS' });

    // AG-005: server-side 잠금 (Redis)
    const lockKey = `auth:lock:${store_id}:${user_id}`;
    const locked = await redis.get(lockKey);
    if (locked) {
      const ttl = await redis.ttl(lockKey);
      return reply.status(429).send({ error: 'ACCOUNT_LOCKED', retry_after: ttl });
    }

    const failKey = `auth:fail:${store_id}:${user_id}`;
    const valid = await bcrypt.compare(pin, user.pin_hash);

    if (!valid) {
      const fails = await redis.incr(failKey);
      if (fails === 1) await redis.expire(failKey, PIN_LOCK_SEC * PIN_MAX_FAILS);
      if (fails >= PIN_MAX_FAILS) {
        await redis.set(lockKey, '1', 'EX', PIN_LOCK_SEC);
        await redis.del(failKey);
        return reply.status(429).send({ error: 'ACCOUNT_LOCKED', retry_after: PIN_LOCK_SEC });
      }
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', attempts_left: PIN_MAX_FAILS - fails });
    }

    // 성공: 실패 카운터 초기화, last_login_at 갱신
    await redis.del(failKey);
    await db.update(users).set({ last_login_at: new Date() }).where(eq(users.id, user_id));

    // AG-006: jti 부여한 refresh token
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000);

    const payload: JWTPayload = { sub: user_id, store_id, role: user.role ?? 'staff' };

    const access_token = app.jwt.sign({ ...payload, type: 'access' }, { expiresIn: ACCESS_TTL });
    const refresh_token = app.jwt.sign({ ...payload, jti, type: 'refresh' }, { expiresIn: '30d' });

    // DB 백업
    await db.insert(refresh_tokens).values({
      jti,
      user_id,
      store_id,
      expires_at: expiresAt,
    });

    return reply.status(200).send({
      access_token,
      refresh_token,
      user: {
        id:       user.id,
        name:     user.name,
        role:     user.role ?? 'staff',
        store_id,
      },
    });
  });

  // POST /api/auth/refresh
  app.post<{ Body: RefreshBody }>('/refresh', { schema: { body: refreshBody } }, async (req, reply) => {
    let decoded: JWTPayload & { jti: string };
    try {
      decoded = app.jwt.verify(req.body.refresh_token) as typeof decoded;
    } catch {
      return reply.status(401).send({ error: 'INVALID_TOKEN' });
    }

    if (decoded.type !== 'refresh' || !decoded.jti) {
      return reply.status(401).send({ error: 'INVALID_TOKEN_TYPE' });
    }

    // AG-006: revocation 체크
    const revoked = await redis.get(`revoked:jti:${decoded.jti}`);
    if (revoked) return reply.status(401).send({ error: 'TOKEN_REVOKED' });

    const payload: JWTPayload = { sub: decoded.sub, store_id: decoded.store_id, role: decoded.role };
    const access_token = app.jwt.sign({ ...payload, type: 'access' }, { expiresIn: ACCESS_TTL });

    return reply.status(200).send({ access_token });
  });

  // GET /api/auth/me
  app.get('/me', { preHandler: authenticate }, async (req, reply) => {
    const { sub: user_id, store_id } = req.user as JWTPayload;

    // AG-001
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        store_id: users.store_id,
        last_login_at: users.last_login_at,
      })
      .from(users)
      .where(and(eq(users.store_id, store_id), eq(users.id, user_id)))
      .limit(1);

    if (!user) return reply.status(404).send({ error: 'USER_NOT_FOUND' });
    return reply.send(user);
  });

  // POST /api/auth/logout
  app.post<{ Body: LogoutBody }>('/logout', {
    schema: { body: refreshBody },
    preHandler: authenticate,
  }, async (req, reply) => {
    let decoded: JWTPayload & { jti?: string; exp?: number };
    try {
      decoded = app.jwt.verify(req.body.refresh_token) as typeof decoded;
    } catch {
      return reply.status(204).send(); // 이미 만료됐어도 logout은 성공 처리
    }

    if (decoded.jti) {
      // AG-006: jti를 revocation set에 추가 (TTL = 남은 만료시간)
      const now = Math.floor(Date.now() / 1000);
      const ttl = decoded.exp ? Math.max(decoded.exp - now, 1) : REFRESH_TTL_SEC;

      await redis.set(`revoked:jti:${decoded.jti}`, '1', 'EX', ttl);

      // DB 폐기 기록
      await db
        .update(refresh_tokens)
        .set({ revoked_at: new Date(), revoke_reason: 'logout' })
        .where(eq(refresh_tokens.jti, decoded.jti));
    }

    return reply.status(204).send();
  });
};

export default authRoutes;
