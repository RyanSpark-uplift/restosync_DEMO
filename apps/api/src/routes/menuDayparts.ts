// Sprint 1 S1.15 — Daypart windows GET/PUT (M01 PRD v1.2 §4.3 Page D)
// AG-013 6-value enum / BR-02 stores.timezone / AG-023 commit 후 broadcast
// 겹침 검증은 Zod refine에서 처리

import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/db';
import { stores } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { broadcast } from '../ws/broadcast';
import { logAudit } from '../services/audit';
import { invalidateSnapshot } from '../services/menuSnapshot';
import type { JWTPayload } from '../types';
import { DaypartUpdateSchema } from '../schemas/menu';

const daypartsPlugin: FastifyPluginAsync = async (app) => {

  // GET /api/menu/dayparts
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const [store] = await db.select({
      timezone:         stores.timezone,
      daypart_windows:  stores.daypart_windows,
      business_hours:   stores.business_hours,
    }).from(stores).where(eq(stores.id, store_id)).limit(1);

    if (!store) return reply.status(404).send({ error: 'STORE_NOT_FOUND' });
    return reply.send({
      timezone: store.timezone,
      windows:  store.daypart_windows ?? {},
      business_hours: store.business_hours ?? {},
    });
  });

  // PUT /api/menu/dayparts — 겹침 검증 (Zod refine)
  app.put('/', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const parsed = DaypartUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(422).send({ error: 'INVALID_WINDOWS', issues: parsed.error.issues });
    }

    const [before] = await db.select({ daypart_windows: stores.daypart_windows })
      .from(stores).where(eq(stores.id, store_id)).limit(1);
    if (!before) return reply.status(404).send({ error: 'STORE_NOT_FOUND' });

    await db.update(stores)
      .set({ daypart_windows: parsed.data.windows })
      .where(eq(stores.id, store_id));

    await logAudit({
      store_id, entity_type: 'menu_daypart', entity_id: store_id,
      operation: 'daypart_change', user_id,
      before: { windows: before.daypart_windows },
      after:  { windows: parsed.data.windows },
    }, req.log);

    await invalidateSnapshot(store_id);  // AM01-013

    broadcast(store_id, 'display:daypart_changed', { windows: parsed.data.windows },
      (c) => c.device_type === 'tablet' || c.device_type === 'tv');

    return reply.send({ windows: parsed.data.windows });
  });
};

export default daypartsPlugin;
