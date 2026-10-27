// Customer-facing QR self-tracking — spec sec.21.
//
// Public, unauthenticated. Mounted under '/qr' (AG-009 exemption — same pattern
// as /webhook and /health). Token = base64url(payload).base64url(hmac-sha256).
// Payload: { o: order_id, s: store_id, x: expiry_epoch_seconds }.
//
// Secret: process.env.QR_HMAC_SECRET. If unset, /qr endpoints return 503 so the
// operator must explicitly configure secrets before public exposure.
//
// AG-019: same per-IP rate-limit and ban pattern as webhooks.

import type { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/db';
import { orders } from '../db/schema';

interface TokenPayload { o: string; s: string; x: number }

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(secret: string, payload: string): string {
  return b64url(crypto.createHmac('sha256', secret).update(payload).digest());
}

export function generateQrToken(orderId: string, storeId: string, ttlSeconds = 86_400): string | null {
  const secret = process.env.QR_HMAC_SECRET;
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: TokenPayload = { o: orderId, s: storeId, x: exp };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig  = sign(secret, body);
  return `${body}.${sig}`;
}

function verifyToken(token: string, secret: string): TokenPayload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(secret, body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString('utf8')) as TokenPayload;
    if (typeof payload.x !== 'number' || payload.x < Math.floor(Date.now() / 1000)) return null;
    if (!payload.o || !payload.s) return null;
    return payload;
  } catch {
    return null;
  }
}

const qrPlugin: FastifyPluginAsync = async (app) => {
  // Per-IP ban check (mirrors webhook hook in server.ts)
  app.addHook('onRequest', async (req, reply) => {
    const banned = await req.server.redis.get(`qr:ban:${req.ip}`);
    if (banned) return reply.status(429).send({ error: 'BANNED' });
  });

  app.get<{ Params: { token: string }; Querystring: { format?: string } }>(
    '/o/:token',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const secret = process.env.QR_HMAC_SECRET;
      if (!secret) return reply.status(503).send({ error: 'QR_NOT_CONFIGURED' });

      const payload = verifyToken(req.params.token, secret);
      if (!payload) {
        // Throttle invalid tokens — same pattern as webhook AG-019.
        const failKey = `qr:fail:${req.ip}`;
        const fails = await req.server.redis.incr(failKey);
        if (fails === 1) await req.server.redis.expire(failKey, 3600);
        if (fails >= 10) await req.server.redis.set(`qr:ban:${req.ip}`, '1', 'EX', 3600);
        return reply.status(404).send({ error: 'INVALID_OR_EXPIRED' });
      }

      const [order] = await db.select({
        id: orders.id,
        store_id: orders.store_id,
        display_number: orders.display_number,
        status: orders.status,
        customer_name: orders.customer_name,
        pickup_location: orders.pickup_location,
        estimated_prep_minutes: orders.estimated_prep_minutes,
        items_summary: orders.items_summary,
        created_at: orders.created_at,
        ready_at: orders.ready_at,
      })
      .from(orders)
      .where(and(eq(orders.store_id, payload.s), eq(orders.id, payload.o)))
      .limit(1);

      if (!order) return reply.status(404).send({ error: 'NOT_FOUND' });

      const wantsHtml = (req.query.format ?? '').toLowerCase() !== 'json'
        && (req.headers.accept ?? '').includes('text/html');

      const json = {
        display_number: order.display_number,
        status: order.status,
        customer_name: order.customer_name,
        pickup_location: order.pickup_location,
        estimated_prep_minutes: order.estimated_prep_minutes,
        items_summary: order.items_summary,
        created_at: order.created_at,
        ready_at: order.ready_at,
      };

      if (!wantsHtml) return reply.send(json);

      // Minimal HTML — operator brand styling lives in store_settings.qr.tracking_page_branding (P4).
      const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Order #${order.display_number}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:24px;background:#0f172a;color:#f8fafc;line-height:1.4}
  .num{font-size:64px;font-weight:900;letter-spacing:-2px;margin:8px 0}
  .status{font-size:24px;font-weight:600;padding:8px 16px;border-radius:999px;display:inline-block;background:#1e293b;margin:8px 0}
  .ready{background:#10B981;color:#000}
  .meta{font-size:14px;color:#cbd5e1;margin-top:24px}
  .meta div{margin:4px 0}
</style></head><body>
<div>Order</div>
<div class="num">#${order.display_number}</div>
<div class="status${order.status === 'ready' ? ' ready' : ''}">${(order.status ?? 'new').replace(/_/g, ' ')}</div>
<div class="meta">
${order.pickup_location ? `<div>Pickup: ${order.pickup_location}</div>` : ''}
${order.estimated_prep_minutes ? `<div>Estimated: ~${order.estimated_prep_minutes} min</div>` : ''}
${order.items_summary ? `<div>${order.items_summary}</div>` : ''}
</div>
</body></html>`;
      reply.type('text/html').send(html);
    },
  );
};

export default qrPlugin;
