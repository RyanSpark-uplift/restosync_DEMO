import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/db';
import { redis } from '../db/redis';
import { stores, orders } from '../db/schema';
import { verifyHMAC } from '../middleware/hmac';
import { broadcast } from '../ws/broadcast';

// ── 공통: store slug → store_id 조회 (AG-001) ────────────────────────────────
async function resolveStore(req: FastifyRequest, reply: FastifyReply) {
  const slug = (req.query as { store?: string }).store;
  if (!slug) {
    reply.status(400).send({ error: 'MISSING_STORE_PARAM' });
    return null;
  }

  const [store] = await db
    .select({ id: stores.id, timezone: stores.timezone })
    .from(stores)
    .where(eq(stores.slug, slug))
    .limit(1);

  if (!store) {
    reply.status(404).send({ error: 'STORE_NOT_FOUND' });
    return null;
  }
  return store;
}

// ── display_number 생성 (orders.ts와 동일 로직, 공유 안 함 — 의도적 중복) ──
async function nextDisplayNumber(storeId: string): Promise<string> {
  const key = `display:counter:${storeId}`;
  const raw = await redis.incr(key);
  const n = ((raw - 1) % 99) + 1;
  return String(n);
}

// ── 주문 생성 공통 헬퍼 ───────────────────────────────────────────────────────
async function createWebhookOrder(
  storeId: string,
  source: typeof orders.$inferInsert['source'],
  externalId: string | undefined,
  customerName: string | undefined,
  items: unknown[],
) {
  const display_number = await nextDisplayNumber(storeId);

  const [order] = await db.insert(orders).values({
    store_id: storeId,
    display_number,
    customer_name: customerName,
    status: 'new',
    source,
    items: JSON.stringify(items),
    external_id: externalId,
  }).returning();

  broadcast(storeId, 'order:new', order, (c) => c.device_type === 'tablet');
  return order;
}

// ── Plugin ────────────────────────────────────────────────────────────────────
const webhookPlugin: FastifyPluginAsync = async (app) => {

  // AG-019: /webhook/* 별도 rate limit (20/min/IP)
  await app.register(async function webhookRoutes(instance) {

    await instance.register(
      // @ts-ignore — rateLimit는 이미 server.ts에서 글로벌 등록됨, 로컬 오버라이드
      (await import('@fastify/rate-limit')).default,
      { max: 20, timeWindow: '1 minute' },
    );

    // POST /webhook/grubhub
    instance.post('/webhook/grubhub', {
      preHandler: verifyHMAC('WEBHOOK_SECRET_GRUBHUB'),
    }, async (req, reply) => {
      const store = await resolveStore(req, reply);
      if (!store) return;

      const body = req.body as {
        order_id?: string;
        customer?: { name?: string };
        items?: unknown[];
      };

      await createWebhookOrder(
        store.id,
        'grubhub',
        body.order_id,
        body.customer?.name,
        body.items ?? [],
      );

      return reply.send({ received: true });
    });

    // POST /webhook/doordash
    instance.post('/webhook/doordash', {
      preHandler: verifyHMAC('WEBHOOK_SECRET_DOORDASH'),
    }, async (req, reply) => {
      const store = await resolveStore(req, reply);
      if (!store) return;

      const body = req.body as {
        external_delivery_id?: string;
        customer?: { first_name?: string };
        items?: unknown[];
      };

      await createWebhookOrder(
        store.id,
        'doordash',
        body.external_delivery_id,
        body.customer?.first_name,
        body.items ?? [],
      );

      return reply.send({ received: true });
    });

    // POST /webhook/ubereats
    instance.post('/webhook/ubereats', {
      preHandler: verifyHMAC('WEBHOOK_SECRET_UBEREATS'),
    }, async (req, reply) => {
      const store = await resolveStore(req, reply);
      if (!store) return;

      const body = req.body as {
        id?: string;
        eater?: { name?: string };
        cart?: { items?: unknown[] };
      };

      await createWebhookOrder(
        store.id,
        'ubereats',
        body.id,
        body.eater?.name,
        body.cart?.items ?? [],
      );

      return reply.send({ received: true });
    });
  });
};

export default webhookPlugin;
