import { randomUUID } from 'crypto';
import { createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import type { FastifyPluginAsync } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/db';
import { events } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { broadcast } from '../ws/broadcast';
import type { JWTPayload } from '../types';
import { EVENT_TYPE } from '@restosync/shared/enums';

// ── JSON Schema ──────────────────────────────────────────────────────────────
const createEventBody = {
  type: 'object' as const,
  required: ['type'],
  properties: {
    title:       { type: 'string', maxLength: 100 },
    type:        { type: 'string', enum: EVENT_TYPE as unknown as string[] },
    ticker_text: { type: 'string' },
    image_url:   { type: 'string' },
    cta_url:     { type: 'string', format: 'uri', maxLength: 500 },
    start_at:    { type: 'string', format: 'date-time' },
    end_at:      { type: 'string', format: 'date-time' },
    recurrence:  { type: 'object' },
  },
  additionalProperties: false,
};

const updateEventBody = {
  type: 'object' as const,
  properties: {
    title:       { type: 'string', maxLength: 100 },
    type:        { type: 'string', enum: EVENT_TYPE as unknown as string[] },
    ticker_text: { type: 'string' },
    image_url:   { type: 'string' },
    cta_url:     { type: 'string', format: 'uri', maxLength: 500 },
    start_at:    { type: 'string', format: 'date-time' },
    end_at:      { type: 'string', format: 'date-time' },
    recurrence:  { type: 'object' },
    active:      { type: 'boolean' },
  },
  additionalProperties: false,
};

interface CreateEventBody {
  title?: string;
  type: string;
  ticker_text?: string;
  image_url?: string;
  cta_url?: string;
  start_at?: string;
  end_at?: string;
  recurrence?: Record<string, unknown>;
}
interface UpdateEventBody extends Partial<CreateEventBody> { active?: boolean }

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'events');
try { mkdirSync(UPLOAD_DIR, { recursive: true }); } catch { /* already exists */ }

const ALLOWED_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
  'image/gif':  '.gif',
};

// ── Plugin ────────────────────────────────────────────────────────────────────
const eventsPlugin: FastifyPluginAsync = async (app) => {

  // POST /api/events/upload
  app.post('/upload', { preHandler: authenticate }, async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'NO_FILE' });

    const ext = ALLOWED_EXT[data.mimetype];
    if (!ext) return reply.status(400).send({ error: 'UNSUPPORTED_TYPE' });

    const filename = `${randomUUID()}${ext}`;
    const dest = join(UPLOAD_DIR, filename);
    await pipeline(data.file, createWriteStream(dest));

    return reply.send({ url: `/uploads/events/${filename}` });
  });

  // GET /api/events/active — static route (/:id보다 먼저 등록)
  app.get('/active', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;

    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.store_id, store_id), eq(events.active, true)))
      .orderBy(events.start_at);

    return reply.send(rows);
  });

  // GET /api/events
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;

    const rows = await db
      .select()
      .from(events)
      .where(eq(events.store_id, store_id))
      .orderBy(events.start_at);

    return reply.send(rows);
  });

  // POST /api/events
  app.post<{ Body: CreateEventBody }>(
    '/',
    { preHandler: authenticate, schema: { body: createEventBody } },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { title, type, ticker_text, image_url, cta_url, start_at, end_at, recurrence } = req.body;

      const [event] = await db.insert(events).values({
        store_id,
        title,
        type: type as typeof events.$inferInsert['type'],
        ticker_text,
        image_url,
        cta_url,
        start_at: start_at ? new Date(start_at) : undefined,
        end_at:   end_at   ? new Date(end_at)   : undefined,
        recurrence: recurrence ? JSON.stringify(recurrence) : undefined,
        active: false,
      }).returning();

      return reply.status(201).send(event);
    },
  );

  // PATCH /api/events/:id
  app.patch<{ Params: { id: string }; Body: UpdateEventBody }>(
    '/:id',
    { preHandler: authenticate, schema: { body: updateEventBody } },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { id } = req.params;
      const { start_at, end_at, recurrence, type, ...rest } = req.body;

      const updateFields: Record<string, unknown> = { ...rest };
      if (type !== undefined) updateFields.type = type;
      if (start_at !== undefined) updateFields.start_at = new Date(start_at);
      if (end_at   !== undefined) updateFields.end_at   = new Date(end_at);
      if (recurrence !== undefined) updateFields.recurrence = JSON.stringify(recurrence);

      if (Object.keys(updateFields).length === 0) {
        return reply.status(400).send({ error: 'NO_FIELDS' });
      }

      const [updated] = await db
        .update(events)
        .set(updateFields)
        .where(and(eq(events.store_id, store_id), eq(events.id, id)))
        .returning();

      if (!updated) return reply.status(404).send({ error: 'EVENT_NOT_FOUND' });

      // 수동으로 active 변경 시 WS push
      if (rest.active === true) {
        broadcast(store_id, 'display:event_push', updated,
          (c) => c.device_type === 'tv' && c.role === 'event');
      } else if (rest.active === false) {
        broadcast(store_id, 'display:event_clear', { event_id: id },
          (c) => c.device_type === 'tv' && c.role === 'event');
      }

      return reply.send(updated);
    },
  );

  // DELETE /api/events/:id
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: authenticate },
    async (req, reply) => {
      const { store_id } = req.user as JWTPayload;
      const { id } = req.params;

      const [deleted] = await db
        .delete(events)
        .where(and(eq(events.store_id, store_id), eq(events.id, id)))
        .returning();

      if (!deleted) return reply.status(404).send({ error: 'EVENT_NOT_FOUND' });

      if (deleted.active) {
        broadcast(store_id, 'display:event_clear', { event_id: id },
          (c) => c.device_type === 'tv' && c.role === 'event');
      }

      return reply.status(204).send();
    },
  );
};

export default eventsPlugin;
