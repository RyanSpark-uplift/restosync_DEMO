// Menu Import worker — Sprint 5A (PRD §3.5 / §5.3, AG-022)
//
// Picks up menu-import jobs and:
//   1. status pending → validating
//   2. read xlsx from raw_path
//   3. iterate rows through ImportRowSchema.safeParse
//   4. update menu_import_jobs with total / valid / invalid + errors + preview
//   5. status → preview_ready (or failed on read/parse error)
//
// Sprint 5B: execute job (transaction) is a separate handler — this worker only validates.
// AG-001 store_id 격리는 update WHERE에 store_id 명시.

import { Worker, type Job } from 'bullmq';
import ExcelJS from 'exceljs';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/db';
import { menu_import_jobs } from '../db/schema';
import {
  IMPORT_QUEUE_NAME,
  getImportConnection,
  type ImportJobPayload,
} from '../services/importQueue';
import { ImportRowSchema } from '../schemas/menu';

const PREVIEW_LIMIT = 20;        // Sprint 5B: client paginates if needed
const ERROR_LIMIT   = 500;       // hard cap to keep jsonb small

interface ImportError { row: number; field?: string; message: string }

export async function processImportJob(job: Job<ImportJobPayload>): Promise<{
  total: number; valid: number; invalid: number;
}> {
  const { job_id, store_id, raw_path } = job.data;

  // 1. validating
  await db.update(menu_import_jobs)
    .set({ status: 'validating', started_at: new Date() })
    .where(and(
      eq(menu_import_jobs.id, job_id),
      eq(menu_import_jobs.store_id, store_id),
    ));

  // 2. read xlsx
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(raw_path);

  // Expect 'items' sheet (template), fallback to first non-README sheet.
  let sheet = wb.getWorksheet('items');
  if (!sheet) {
    sheet = wb.worksheets.find((s) => s.name.toLowerCase() !== 'readme');
  }
  if (!sheet) {
    await db.update(menu_import_jobs)
      .set({
        status: 'failed', finished_at: new Date(),
        errors: [{ row: 0, message: 'No data sheet found in workbook' }],
      })
      .where(and(eq(menu_import_jobs.id, job_id), eq(menu_import_jobs.store_id, store_id)));
    return { total: 0, valid: 0, invalid: 0 };
  }

  // Header row = 1. Build column-index map (case-insensitive, strip ' *').
  const headerRow = sheet.getRow(1);
  const headerByCol = new Map<number, string>();
  headerRow.eachCell((cell, col) => {
    const raw = String(cell.value ?? '').trim().toLowerCase().replace(/\s*\*\s*$/, '');
    if (raw) headerByCol.set(col, raw);
  });

  const errors: ImportError[] = [];
  const preview: Record<string, unknown>[] = [];
  let total = 0, valid = 0, invalid = 0;

  // Iterate data rows (skip header).
  const lastRow = sheet.rowCount;
  for (let r = 2; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    // Skip empty rows.
    if (!row.hasValues) continue;

    const obj: Record<string, unknown> = {};
    headerByCol.forEach((key, col) => {
      const cell = row.getCell(col);
      const v: unknown = cell.value;
      // exceljs returns rich objects for formula/date/hyperlink — flatten to primitives.
      if (v === null || v === undefined) {
        obj[key] = null;
      } else if (typeof v === 'object' && v !== null && 'text' in (v as object)) {
        obj[key] = String((v as { text: unknown }).text ?? '');
      } else if (typeof v === 'object' && v !== null && 'result' in (v as object)) {
        obj[key] = (v as { result: unknown }).result;
      } else {
        obj[key] = v;
      }
    });

    total++;
    const parsed = ImportRowSchema.safeParse(obj);
    if (!parsed.success) {
      invalid++;
      if (errors.length < ERROR_LIMIT) {
        for (const issue of parsed.error.issues) {
          errors.push({
            row: r,
            field: issue.path.join('.') || undefined,
            message: issue.message,
          });
          if (errors.length >= ERROR_LIMIT) break;
        }
      }
    } else {
      valid++;
      if (preview.length < PREVIEW_LIMIT) {
        preview.push({ row: r, ...parsed.data });
      }
    }
  }

  // 3. finalize
  const status: 'preview_ready' | 'failed' = total === 0 ? 'failed' : 'preview_ready';
  await db.update(menu_import_jobs)
    .set({
      status,
      total_rows:   total,
      valid_rows:   valid,
      invalid_rows: invalid,
      errors:       errors.length > 0 ? errors : null,
      preview:      preview.length > 0 ? preview : null,
      finished_at:  new Date(),
    })
    .where(and(eq(menu_import_jobs.id, job_id), eq(menu_import_jobs.store_id, store_id)));

  return { total, valid, invalid };
}

let worker: Worker<ImportJobPayload> | null = null;

export function startImportWorker(): Worker<ImportJobPayload> | null {
  const connection = getImportConnection();
  if (!connection) return null;   // test env / no Redis

  worker = new Worker<ImportJobPayload>(
    IMPORT_QUEUE_NAME,
    async (job) => {
      try {
        return await processImportJob(job);
      } catch (err) {
        // Mark job failed in DB before re-throwing (BullMQ will retry per JobsOptions).
        try {
          await db.update(menu_import_jobs)
            .set({
              status: 'failed', finished_at: new Date(),
              errors: [{ row: 0, message: err instanceof Error ? err.message : 'Worker error' }],
            })
            .where(and(
              eq(menu_import_jobs.id, job.data.job_id),
              eq(menu_import_jobs.store_id, job.data.store_id),
            ));
        } catch {
          // swallow — primary error is more useful in BullMQ logs
        }
        throw err;
      }
    },
    { connection, concurrency: 1 },   // BR-33 enforced at DB; concurrency=1 is defensive
  );
  return worker;
}

export async function __stopImportWorker(): Promise<void> {
  await worker?.close();
  worker = null;
}
