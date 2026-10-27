// Analytics — spec sec.15.
// GET /api/analytics/orders?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns aggregate metrics over the date range (defaults to last 7 days).
// AG-001 store-scoped via JWT.

import type { FastifyPluginAsync } from 'fastify';
import { sql, and, eq, gte, lte } from 'drizzle-orm';
import { db } from '../db/db';
import { orders } from '../db/schema';
import { authenticate } from '../middleware/auth';
import type { JWTPayload } from '../types';

interface QueryShape { from?: string; to?: string }

function isoDate(v: string | undefined, fallback: Date): Date {
  if (!v) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

const analyticsPlugin: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: QueryShape }>(
    '/orders',
    {
      preHandler: authenticate,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to:   { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const now = new Date();
      const to   = isoDate(req.query.to, now);
      const from = isoDate(req.query.from, new Date(now.getTime() - 7 * 24 * 3600 * 1000));

      const where = and(
        eq(orders.store_id, store_id),
        gte(orders.created_at, from),
        lte(orders.created_at, to),
      );

      // Single aggregate query — compact and avoids N+1.
      const rows = await db
        .select({
          // Counts by terminal status.
          total:      sql<number>`count(*)::int`,
          collected:  sql<number>`count(*) FILTER (WHERE "status" = 'collected')::int`,
          expired:    sql<number>`count(*) FILTER (WHERE "status" = 'expired')::int`,
          cancelled:  sql<number>`count(*) FILTER (WHERE "status" = 'cancelled')::int`,
          // Wait/prep times in seconds (PG epoch difference).
          avg_wait_seconds: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM ("collected_at" - "ready_at")))::int, 0)`,
          max_wait_seconds: sql<number>`COALESCE(MAX(EXTRACT(EPOCH FROM ("collected_at" - "ready_at")))::int, 0)`,
          avg_prep_seconds: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM ("ready_at" - "preparing_at")))::int, 0)`,
        })
        .from(orders)
        .where(where);

      const r = rows[0] ?? {
        total: 0, collected: 0, expired: 0, cancelled: 0,
        avg_wait_seconds: 0, max_wait_seconds: 0, avg_prep_seconds: 0,
      };

      // orders_per_hour, peak_concurrent — derived series.
      const perHour = await db
        .select({
          hour: sql<string>`date_trunc('hour', "created_at")::text`,
          n:    sql<number>`count(*)::int`,
        })
        .from(orders)
        .where(where)
        .groupBy(sql`date_trunc('hour', "created_at")`)
        .orderBy(sql`date_trunc('hour', "created_at")`);

      const ordersPerHour = perHour.length === 0
        ? 0
        : Math.round(perHour.reduce((acc, x) => acc + x.n, 0) / perHour.length);

      const peakConcurrent = perHour.reduce((m, x) => Math.max(m, x.n), 0);

      const finished = r.collected + r.expired;
      const pickupRate  = finished === 0 ? 0 : Math.round((r.collected / finished) * 100);
      const expiredRate = finished === 0 ? 0 : Math.round((r.expired   / finished) * 100);

      return reply.send({
        window: { from: from.toISOString(), to: to.toISOString() },
        total: r.total,
        collected: r.collected,
        expired: r.expired,
        cancelled: r.cancelled,
        avg_wait_seconds: r.avg_wait_seconds,
        max_wait_seconds: r.max_wait_seconds,
        avg_prep_seconds: r.avg_prep_seconds,
        pickup_rate_pct:  pickupRate,
        expired_rate_pct: expiredRate,
        orders_per_hour:  ordersPerHour,
        peak_concurrent:  peakConcurrent,
        per_hour: perHour,
      });
    },
  );
};

export default analyticsPlugin;
