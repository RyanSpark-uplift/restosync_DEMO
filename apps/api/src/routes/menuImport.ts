// Sprint 5A — Menu Import endpoints (PRD §3.5 Page E, §5.3, BR-25~34)
//
// 5A scope: template DL + upload(BullMQ enqueue) + status polling.
// 5B scope: errors CSV + preview + execute (transaction).
//
// AG-001 store_id WHERE / AG-009 /api prefix
// AG-013 IMPORT_STATUS / IMPORT_SOURCE 정본 (CHECK constraints in migration 0018)
// AG-022 transcode/import는 worker 분리 — 본 라우트는 enqueue만
// BR-33 store당 동시 1 active job — partial unique 0018에서 enforce(23505)
// BR-27 raw file 24h TTL — P2 R2 lifecycle. P1은 worker가 종료 시 unlink.
// BR-25 Excel 가격은 달러 → 서버에서 cents 변환 (ImportRowSchema.transform)
//
// RBAC: owner / manager only (kitchen/staff 차단).

import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { eq, and, isNull, sql } from 'drizzle-orm';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import ExcelJS from 'exceljs';
import { db } from '../db/db';
import { menu_import_jobs, menu_items, menu_categories } from '../db/schema';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { logAudit } from '../services/audit';
import { invalidateSnapshot } from '../services/menuSnapshot';
import { broadcast } from '../ws/broadcast';
import { enqueueImportJob } from '../services/importQueue';
import type { JWTPayload } from '../types';
import { ImportTemplateQuerySchema, ImportExecuteSchema } from '../schemas/menu';
import { DAYPART, ALLERGEN } from '@restosync/shared/enums';

// Local raw-file directory (P1). P2에서 R2 키로 교체.
const TMP_ROOT = path.resolve(process.cwd(), 'tmp', 'import');

// AG-013 5-lang headers (template 일관성).
const TEMPLATE_HEADERS = [
  { key: 'name_en',        header: 'name_en *',     width: 28 },
  { key: 'name_ko',        header: 'name_ko',       width: 20 },
  { key: 'name_es',        header: 'name_es',       width: 20 },
  { key: 'name_zh',        header: 'name_zh',       width: 20 },
  { key: 'name_ja',        header: 'name_ja',       width: 20 },
  { key: 'description_en', header: 'description_en', width: 36 },
  { key: 'category_en',    header: 'category_en',   width: 16 },
  { key: 'price_usd',      header: 'price_usd *',   width: 12 },
  { key: 'dayparts',       header: 'dayparts',      width: 24 },
  { key: 'allergens',      header: 'allergens',     width: 24 },
  { key: 'calories',       header: 'calories',      width: 12 },
  { key: 'spice_level',    header: 'spice_level',   width: 14 },
  { key: 'external_id',    header: 'external_id',   width: 18 },
];

async function buildTemplateXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RestoSync';
  wb.created = new Date();

  const items = wb.addWorksheet('items');
  items.columns = TEMPLATE_HEADERS;

  // Header row styling — bold + frozen.
  items.getRow(1).font = { bold: true };
  items.views = [{ state: 'frozen', ySplit: 1 }];

  // One sample row.
  items.addRow({
    name_en:        'Margherita Pizza',
    name_ko:        '마르게리타 피자',
    name_es:        'Pizza Margarita',
    description_en: 'Classic Italian pizza with Apple and mozzarella.',
    category_en:    'Pizza',
    price_usd:      14.99,
    dayparts:       'lunch,dinner',
    allergens:      'milk,wheat',
    calories:       820,
    spice_level:    'none',
  });

  // README sheet — column rules.
  const readme = wb.addWorksheet('README');
  readme.columns = [{ width: 90 }];
  const lines = [
    'RestoSync Menu Import — Template (v1, Sprint 5A)',
    '',
    '* Required columns marked with * (name_en, price_usd).',
    '',
    'name_*       — 5-lang i18n (en required, ko/es/zh/ja optional)',
    'description_en — short menu description (other langs in P2)',
    'category_en  — string; matched by name to existing category, or created on import',
    'price_usd    — dollars (decimal, max 2 digits). Server stores as integer cents (BR-25).',
    'dayparts     — comma list: breakfast, lunch, snack, dinner, late, all',
    'allergens    — comma list: milk, egg, fish, shellfish, tree_nut, peanut, wheat, soy, sesame (FDA 9)',
    'calories     — integer kcal (optional)',
    'spice_level  — none | mild | medium | hot | extreme (optional)',
    'external_id  — POS/import key for upsert (BR-26 store-scoped unique)',
    '',
    'IMPORTANT — Import execution is NOT reversible (BR-30). Test with a few rows first.',
    'Lenient mode (default) skips invalid rows; strict mode aborts on any error (BR-31).',
  ];
  for (const l of lines) readme.addRow([l]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

const importPlugin: FastifyPluginAsync = async (app) => {

  // ── GET /api/menu/import/template ────────────────────────────────────────
  app.get('/template', { preHandler: authenticate }, async (req, reply) => {
    const parsed = ImportTemplateQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_QUERY', issues: parsed.error.issues });
    }

    // csv_zip은 향후 (P1.5) — Sprint 5A는 xlsx만.
    if (parsed.data.format === 'csv_zip') {
      return reply.status(501).send({ error: 'CSV_ZIP_NOT_IMPLEMENTED', message: 'Use format=xlsx (default).' });
    }

    const buf = await buildTemplateXlsx();
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="restosync-menu-template.xlsx"');
    return reply.send(buf);
  });

  // ── POST /api/menu/import/excel/upload ───────────────────────────────────
  app.post('/excel/upload', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;

    // multipart 단일 파일 (10MB limit는 server.ts multipart config에서 enforce)
    const file = await req.file();
    if (!file) {
      return reply.status(400).send({ error: 'NO_FILE', message: 'multipart/form-data file required' });
    }
    if (!file.filename || !/\.xlsx?$/i.test(file.filename)) {
      // drain to release the stream before bailing
      await file.toBuffer().catch(() => undefined);
      return reply.status(415).send({ error: 'UNSUPPORTED_TYPE', message: '.xlsx required (Sprint 5A)' });
    }

    // Insert job row first — BR-33 partial unique catches concurrent active job (409).
    let jobId: string;
    try {
      const [job] = await db.insert(menu_import_jobs).values({
        store_id, user_id,
        source:   'excel',
        status:   'pending',
        filename: file.filename.slice(0, 200),
      }).returning({ id: menu_import_jobs.id });
      jobId = job.id;
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '23505') {
        // drain stream
        await file.toBuffer().catch(() => undefined);
        return reply.status(409).send({
          error: 'IMPORT_JOB_ACTIVE',
          message: 'Another import job is in progress for this store (BR-33). Wait for it to finish.',
        });
      }
      throw err;
    }

    // Persist raw file under TMP_ROOT/<job_id>.xlsx
    await fs.mkdir(TMP_ROOT, { recursive: true });
    const rawPath = path.join(TMP_ROOT, `${jobId}.xlsx`);
    try {
      await pipeline(file.file, createWriteStream(rawPath));
    } catch (err) {
      // file persistence failed — mark job failed and bail.
      await db.update(menu_import_jobs)
        .set({ status: 'failed', finished_at: new Date(),
               errors: [{ row: 0, message: 'Failed to persist uploaded file' }] })
        .where(and(eq(menu_import_jobs.id, jobId), eq(menu_import_jobs.store_id, store_id)));
      throw err;
    }
    if (file.file.truncated) {
      // multipart limit hit — server.ts multipart config should set limits.fileSize
      await fs.unlink(rawPath).catch(() => undefined);
      await db.update(menu_import_jobs)
        .set({ status: 'failed', finished_at: new Date(),
               errors: [{ row: 0, message: 'File exceeds 10MB limit' }] })
        .where(and(eq(menu_import_jobs.id, jobId), eq(menu_import_jobs.store_id, store_id)));
      return reply.status(413).send({ error: 'FILE_TOO_LARGE', job_id: jobId });
    }

    await db.update(menu_import_jobs)
      .set({ raw_path: rawPath })
      .where(and(eq(menu_import_jobs.id, jobId), eq(menu_import_jobs.store_id, store_id)));

    // Enqueue BullMQ job — worker picks up, validates rows, transitions to preview_ready/failed.
    await enqueueImportJob({ job_id: jobId, store_id, raw_path: rawPath });

    await logAudit({
      store_id, entity_type: 'menu_item', entity_id: jobId,
      operation: 'bulk_import', user_id,
      reason: 'import_upload',
      after: { filename: file.filename, job_id: jobId },
    }, req.log);

    return reply.status(202).send({ job_id: jobId, status: 'pending' });
  });

  // ── GET /api/menu/import/jobs/:id ────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/jobs/:id', {
    preHandler: authenticate,
  }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const { id } = req.params;

    const [row] = await db.select().from(menu_import_jobs)
      .where(and(
        eq(menu_import_jobs.store_id, store_id),
        eq(menu_import_jobs.id, id),
      ))
      .limit(1);
    if (!row) return reply.status(404).send({ error: 'IMPORT_JOB_NOT_FOUND' });

    // Strip raw_path (server-internal). Preview/errors are big — caller fetches via separate endpoints in 5B.
    const { raw_path, errors, preview, ...summary } = row;
    void raw_path;
    return reply.send({
      ...summary,
      has_errors:  Array.isArray(errors) && errors.length > 0,
      has_preview: Array.isArray(preview) && preview.length > 0,
    });
  });

  // ── GET /api/menu/import/jobs/:id/errors — CSV ───────────────────────────
  app.get<{ Params: { id: string } }>('/jobs/:id/errors', {
    preHandler: authenticate,
  }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const { id } = req.params;

    const [row] = await db.select({
      errors: menu_import_jobs.errors,
    }).from(menu_import_jobs)
      .where(and(eq(menu_import_jobs.store_id, store_id), eq(menu_import_jobs.id, id)))
      .limit(1);
    if (!row) return reply.status(404).send({ error: 'IMPORT_JOB_NOT_FOUND' });

    const errors = row.errors ?? [];
    // Minimal RFC 4180 CSV. fields: row, field, message.
    const escape = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = ['row,field,message'];
    for (const e of errors) {
      lines.push(`${e.row},${escape(e.field)},${escape(e.message)}`);
    }
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="import-${id}-errors.csv"`);
    return reply.send(lines.join('\n') + '\n');
  });

  // ── GET /api/menu/import/jobs/:id/preview — JSON rows ────────────────────
  app.get<{ Params: { id: string } }>('/jobs/:id/preview', {
    preHandler: authenticate,
  }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;
    const { id } = req.params;

    const [row] = await db.select({
      status:  menu_import_jobs.status,
      preview: menu_import_jobs.preview,
    }).from(menu_import_jobs)
      .where(and(eq(menu_import_jobs.store_id, store_id), eq(menu_import_jobs.id, id)))
      .limit(1);
    if (!row) return reply.status(404).send({ error: 'IMPORT_JOB_NOT_FOUND' });

    return reply.send({ status: row.status, rows: row.preview ?? [] });
  });

  // ── POST /api/menu/import/jobs/:id/execute — transaction ─────────────────
  // BR-30 NOT reversible (confirm:true required) / BR-31 strict aborts on any error.
  // Sprint 5A worker already wrote preview rows from valid parses. Execute:
  //   1. Verify status === preview_ready
  //   2. strict mode + invalid_rows>0 → 422 STRICT_MODE_HAS_ERRORS
  //   3. status → executing
  //   4. tx:
  //      - lookup-or-create categories by category_en
  //      - upsert menu_items by (store_id, external_id) when external_id present, else insert
  //   5. status → completed (or failed on tx error)
  //   6. broadcast display:full_refresh + invalidateSnapshot
  app.post<{ Params: { id: string } }>('/jobs/:id/execute', {
    preHandler: [authenticate, requireRole(['owner', 'manager'])],
  }, async (req, reply) => {
    const { store_id, sub: user_id } = req.user as JWTPayload;
    const { id } = req.params;

    const parsed = ImportExecuteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    }
    const { mode } = parsed.data;

    const [job] = await db.select().from(menu_import_jobs)
      .where(and(eq(menu_import_jobs.store_id, store_id), eq(menu_import_jobs.id, id)))
      .limit(1);
    if (!job) return reply.status(404).send({ error: 'IMPORT_JOB_NOT_FOUND' });

    if (job.status !== 'preview_ready') {
      return reply.status(409).send({
        error: 'INVALID_STATE',
        status: job.status,
        message: 'Job must be preview_ready before execute.',
      });
    }

    if (mode === 'strict' && (job.invalid_rows ?? 0) > 0) {
      return reply.status(422).send({
        error: 'STRICT_MODE_HAS_ERRORS',
        invalid_rows: job.invalid_rows,
        message: 'Strict mode requires zero invalid rows (BR-31). Fix errors or use lenient.',
      });
    }

    // Transition → executing (no second job can squeeze in — partial unique still holds).
    await db.update(menu_import_jobs)
      .set({ status: 'executing', mode, started_at: new Date() })
      .where(and(eq(menu_import_jobs.store_id, store_id), eq(menu_import_jobs.id, id)));

    const preview = job.preview ?? [];
    let inserted = 0, updated = 0, skipped = 0;

    try {
      await db.transaction(async (tx) => {
        // Cache category lookups across rows (case-insensitive name_i18n.en match).
        const categoryCache = new Map<string, string>();   // lowercased name → id

        for (const raw of preview) {
          const r = raw as Record<string, unknown>;
          const nameEn = typeof r.name_en === 'string' ? r.name_en.trim() : '';
          if (!nameEn) { skipped++; continue; }

          // Category lookup / create
          let category_id: string | null = null;
          const catName = typeof r.category_en === 'string' ? r.category_en.trim() : '';
          if (catName) {
            const key = catName.toLowerCase();
            if (categoryCache.has(key)) {
              category_id = categoryCache.get(key)!;
            } else {
              const [existing] = await tx.select({ id: menu_categories.id })
                .from(menu_categories)
                .where(and(
                  eq(menu_categories.store_id, store_id),
                  isNull(menu_categories.deleted_at),
                  sql`lower(${menu_categories.name}->>'en') = ${key}`,
                ))
                .limit(1);
              if (existing) {
                category_id = existing.id;
              } else {
                const [created] = await tx.insert(menu_categories).values({
                  store_id, name: { en: catName }, is_active: true,
                }).returning({ id: menu_categories.id });
                category_id = created.id;
              }
              categoryCache.set(key, category_id);
            }
          }

          // Build menu_items payload from preview row
          const nameI18n: Record<string, string> = { en: nameEn };
          for (const lang of ['ko', 'es', 'zh', 'ja'] as const) {
            const v = r[`name_${lang}`];
            if (typeof v === 'string' && v.trim() !== '') nameI18n[lang] = v.trim();
          }
          const descEn = typeof r.description_en === 'string' && r.description_en.trim() !== ''
            ? r.description_en.trim() : null;
          const descI18n = descEn ? { en: descEn } : null;

          const priceCents = typeof r.price_usd === 'number'
            ? r.price_usd                         // already cents (BR-25 transform in ImportRowSchema)
            : Number(r.price_usd ?? 0);

          // dayparts csv → array (filter against canonical enum)
          const daypartsRaw = typeof r.dayparts === 'string' ? r.dayparts : '';
          const dayparts_arr = daypartsRaw
            ? daypartsRaw.split(',').map((s) => s.trim().toLowerCase())
                .filter((d): d is typeof DAYPART[number] =>
                  (DAYPART as readonly string[]).includes(d))
            : [];

          const allergensRaw = typeof r.allergens === 'string' ? r.allergens : '';
          const allergens = allergensRaw
            ? allergensRaw.split(',').map((s) => s.trim().toLowerCase())
                .filter((a) => (ALLERGEN as readonly string[]).includes(a))
            : [];

          const calories = typeof r.calories === 'number' ? r.calories : null;
          const spice_level = typeof r.spice_level === 'string' && r.spice_level !== ''
            ? r.spice_level : null;
          const external_id = typeof r.external_id === 'string' && r.external_id.trim() !== ''
            ? r.external_id.trim() : null;

          const insertValues = {
            store_id,
            name:         nameEn,                  // legacy column
            name_i18n:    nameI18n,
            description:  descEn,
            description_i18n: descI18n,
            category_id,
            price_cents:  priceCents,
            dayparts_arr: dayparts_arr.length > 0 ? dayparts_arr : ['all'],
            allergens,
            calories,
            spice_level,
            external_id,
            import_job_id: id,
            import_source: 'excel',
            sync_source:   'restosync',
          };

          // BR-26 upsert by (store_id, external_id) when external_id provided
          if (external_id) {
            const [existing] = await tx.select({ id: menu_items.id })
              .from(menu_items)
              .where(and(
                eq(menu_items.store_id, store_id),
                eq(menu_items.external_id, external_id),
                isNull(menu_items.deleted_at),
              ))
              .limit(1);
            if (existing) {
              await tx.update(menu_items)
                .set({ ...insertValues, updated_at: new Date() })
                .where(and(
                  eq(menu_items.store_id, store_id),
                  eq(menu_items.id, existing.id),
                ));
              updated++;
              continue;
            }
          }

          await tx.insert(menu_items).values(insertValues);
          inserted++;
        }
      });
    } catch (err) {
      await db.update(menu_import_jobs)
        .set({
          status: 'failed', finished_at: new Date(),
          errors: [{ row: 0, message: err instanceof Error ? err.message : 'tx failed' }],
        })
        .where(and(eq(menu_import_jobs.store_id, store_id), eq(menu_import_jobs.id, id)));
      throw err;
    }

    // Finalize
    await db.update(menu_import_jobs)
      .set({ status: 'completed', finished_at: new Date() })
      .where(and(eq(menu_import_jobs.store_id, store_id), eq(menu_import_jobs.id, id)));

    await logAudit({
      store_id, entity_type: 'menu_item', entity_id: id,
      operation: 'bulk_import', user_id,
      reason: `execute:${mode}`,
      after: { inserted, updated, skipped, mode },
    }, req.log);

    // AM01-013 — invalidate snapshot before broadcasting refresh
    await invalidateSnapshot(store_id);

    broadcast(store_id, 'display:full_refresh', { reason: 'import_executed', job_id: id },
      (c) => c.device_type === 'tablet' || (c.device_type === 'tv' && c.role === 'menu'));

    // Best-effort cleanup of raw file (BR-27 prep — P2 uses R2 lifecycle).
    if (job.raw_path) {
      await fs.unlink(job.raw_path).catch(() => undefined);
    }

    return reply.send({
      job_id:   id,
      status:   'completed',
      mode,
      inserted,
      updated,
      skipped,
    });
  });
};

export default importPlugin;

// Exposed for test/setup hooks.
export const __test = { TMP_ROOT, buildTemplateXlsx };
export type { FastifyReply };
