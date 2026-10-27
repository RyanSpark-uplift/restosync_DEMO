import type { FastifyPluginAsync } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/db';
import { venue_groups, venue_group_members, stores } from '../db/schema';
import { authenticate } from '../middleware/auth';
import type { JWTPayload } from '../types';

// ── JSON Schema ──────────────────────────────────────────────────────────────
const createGroupBody = {
  type: 'object' as const,
  required: ['name', 'code'],
  properties: {
    name:           { type: 'string', maxLength: 80 },
    code:           { type: 'string', minLength: 4, maxLength: 20 },
    footer_message: { type: 'string' },
  },
  additionalProperties: false,
};

const addMemberBody = {
  type: 'object' as const,
  properties: {
    label:         { type: 'string', maxLength: 40 },
    color_hex:     { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    display_order: { type: 'integer', default: 0 },
  },
  additionalProperties: false,
};

interface CreateGroupBody { name: string; code: string; footer_message?: string }
interface AddMemberBody { label?: string; color_hex?: string; display_order?: number }

// ── Plugin ────────────────────────────────────────────────────────────────────
const venueGroupsPlugin: FastifyPluginAsync = async (app) => {

  // POST /api/venue-groups — create food court group (auth)
  app.post<{ Body: CreateGroupBody }>(
    '/',
    { preHandler: authenticate, schema: { body: createGroupBody } },
    async (req, reply) => {
      const { name, code, footer_message } = req.body;

      try {
        const [group] = await db.insert(venue_groups).values({
          name,
          code: code.toUpperCase(),
          footer_message,
        }).returning();
        return reply.status(201).send(group);
      } catch (err: unknown) {
        if ((err as { code?: string }).code === '23505') {
          return reply.status(409).send({ error: 'CODE_TAKEN' });
        }
        throw err;
      }
    },
  );

  // GET /api/venue-groups/:code — lookup by code for Tablet onboarding (no auth)
  app.get<{ Params: { code: string } }>(
    '/:code',
    async (req, reply) => {
      const { code } = req.params;

      const [group] = await db
        .select()
        .from(venue_groups)
        .where(eq(venue_groups.code, code.toUpperCase()))
        .limit(1);

      if (!group) return reply.status(404).send({ error: 'GROUP_NOT_FOUND' });

      const members = await db
        .select({
          id:            venue_group_members.id,
          store_id:      venue_group_members.store_id,
          label:         venue_group_members.label,
          color_hex:     venue_group_members.color_hex,
          display_order: venue_group_members.display_order,
          store_name:    stores.name,
        })
        .from(venue_group_members)
        .leftJoin(stores, eq(venue_group_members.store_id, stores.id))
        .where(eq(venue_group_members.venue_group_id, group.id))
        .orderBy(venue_group_members.display_order);

      return reply.send({ ...group, members });
    },
  );

  // POST /api/venue-groups/:id/members — add/update this store's membership (auth)
  app.post<{ Params: { id: string }; Body: AddMemberBody }>(
    '/:id/members',
    { preHandler: authenticate, schema: { body: addMemberBody } },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const venue_group_id = req.params.id;
      const { label, color_hex, display_order = 0 } = req.body;

      const [group] = await db
        .select({ id: venue_groups.id })
        .from(venue_groups)
        .where(eq(venue_groups.id, venue_group_id))
        .limit(1);

      if (!group) return reply.status(404).send({ error: 'GROUP_NOT_FOUND' });

      // Upsert — one slot per store per group
      const [existing] = await db
        .select({ id: venue_group_members.id })
        .from(venue_group_members)
        .where(and(
          eq(venue_group_members.store_id, store_id),
          eq(venue_group_members.venue_group_id, venue_group_id),
        ))
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(venue_group_members)
          .set({ label, color_hex, display_order })
          .where(eq(venue_group_members.id, existing.id))
          .returning();
        return reply.send(updated);
      }

      const [member] = await db.insert(venue_group_members).values({
        store_id,
        venue_group_id,
        label,
        color_hex,
        display_order,
      }).returning();

      return reply.status(201).send(member);
    },
  );
};

export default venueGroupsPlugin;
