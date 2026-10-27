import crypto from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

// AG-012: raw body + timingSafeEqual. AG-019: HMAC 실패 IP short-ban.
export function verifyHMAC(secretEnvKey: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const secret = process.env[secretEnvKey];
    if (!secret) return; // 개발: secret 미설정 시 skip

    const sig = (req.headers['x-signature'] as string) ?? '';
    const raw = req.rawBody;
    if (!raw) return reply.status(400).send({ error: 'NO_RAW_BODY' });

    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(raw)
      .digest('hex');

    const a = Buffer.from(sig);
    const b = Buffer.from(expected);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      // AG-019: IP별 실패 카운터 → 5회 시 1시간 ban
      const ip = req.ip;
      const failKey = `webhook:fail:${ip}`;
      const fails = await req.server.redis.incr(failKey);
      if (fails === 1) await req.server.redis.expire(failKey, 3600);
      if (fails >= 5) await req.server.redis.set(`webhook:ban:${ip}`, '1', 'EX', 3600);

      return reply.status(401).send({ error: 'INVALID_SIGNATURE' });
    }
  };
}
