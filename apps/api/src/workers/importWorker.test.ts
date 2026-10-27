// Sprint 5A — importWorker validation unit test (live DB, no BullMQ).
// Invokes processImportJob directly with a hand-built xlsx + pre-inserted job row.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import ExcelJS from 'exceljs';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { processImportJob } from './importWorker';
import type { Job } from 'bullmq';
import type { ImportJobPayload } from '../services/importQueue';

const DB_URL   = process.env.DATABASE_URL ?? 'postgresql://rs_user:rs_pass@localhost:5432/restosync';
const STORE_ID = '97313de4-f52c-4381-91dd-cbc491b58943';

let pool: Pool;
let tmpDir: string;
let userId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = DB_URL;
  process.env.NODE_ENV = 'test';
  pool = new Pool({ connectionString: DB_URL });

  // Clear any stale jobs from previous failures.
  await pool.query(`DELETE FROM menu_import_jobs WHERE store_id = $1`, [STORE_ID]);

  const r = await pool.query(
    `SELECT id FROM users WHERE store_id = $1 AND name = 'Ryan' LIMIT 1`,
    [STORE_ID],
  );
  userId = r.rows[0].id;
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rs-import-test-'));
}, 30_000);

afterAll(async () => {
  await pool.query(`DELETE FROM menu_import_jobs WHERE store_id = $1`, [STORE_ID]);
  await pool.end();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeXlsx(name: string, rows: Array<Record<string, unknown>>): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('items');
  sheet.columns = [
    { key: 'name_en',     header: 'name_en' },
    { key: 'price_usd',   header: 'price_usd' },
    { key: 'dayparts',    header: 'dayparts' },
    { key: 'calories',    header: 'calories' },
    { key: 'spice_level', header: 'spice_level' },
    { key: 'category_en', header: 'category_en' },
  ];
  rows.forEach((r) => sheet.addRow(r));
  const filePath = path.join(tmpDir, name);
  await wb.xlsx.writeFile(filePath);
  return filePath;
}

async function createPendingJob(rawPath: string): Promise<string> {
  const r = await pool.query(
    `INSERT INTO menu_import_jobs (store_id, user_id, source, status, filename, raw_path)
     VALUES ($1, $2, 'excel', 'pending', $3, $4) RETURNING id`,
    [STORE_ID, userId, path.basename(rawPath), rawPath],
  );
  return r.rows[0].id;
}

function fakeJob(payload: ImportJobPayload): Job<ImportJobPayload> {
  return { id: 'fake', data: payload, name: 'menu-import' } as unknown as Job<ImportJobPayload>;
}

describe('importWorker — validation', () => {
  // BR-33 partial unique covers active statuses (pending/validating/preview_ready/executing).
  // After each test the job sits in preview_ready/failed which still blocks new inserts —
  // clear between tests so each starts fresh.
  beforeEach(async () => {
    await pool.query(`DELETE FROM menu_import_jobs WHERE store_id = $1`, [STORE_ID]);
  });

  it('All-valid rows → status=preview_ready, valid=N invalid=0', async () => {
    const filePath = await writeXlsx('all-valid.xlsx', [
      { name_en: 'Pizza', price_usd: 12.99, dayparts: 'lunch,dinner', calories: 800, spice_level: 'mild', category_en: 'Pizza' },
      { name_en: 'Salad', price_usd: 8.5,   dayparts: 'lunch',         calories: 200, spice_level: 'none', category_en: 'Salad' },
    ]);
    const jobId = await createPendingJob(filePath);

    const r = await processImportJob(fakeJob({ job_id: jobId, store_id: STORE_ID, raw_path: filePath }));
    expect(r).toEqual({ total: 2, valid: 2, invalid: 0 });

    const row = await pool.query(`SELECT status, total_rows, valid_rows, invalid_rows, errors, preview FROM menu_import_jobs WHERE id = $1`, [jobId]);
    expect(row.rows[0].status).toBe('preview_ready');
    expect(row.rows[0].total_rows).toBe(2);
    expect(row.rows[0].valid_rows).toBe(2);
    expect(row.rows[0].invalid_rows).toBe(0);
    expect(row.rows[0].errors).toBeNull();
    expect(row.rows[0].preview).toHaveLength(2);
    // BR-25: dollars → cents
    expect(row.rows[0].preview[0].price_usd).toBe(1299);
    expect(row.rows[0].preview[1].price_usd).toBe(850);
  });

  it('Mixed rows → status=preview_ready, errors[] populated', async () => {
    const filePath = await writeXlsx('mixed.xlsx', [
      { name_en: 'OK',  price_usd: 5.00, dayparts: 'lunch' },
      { name_en: '',    price_usd: 5.00, dayparts: 'lunch' },              // invalid: empty name_en
      { name_en: 'BadPrice', price_usd: 'not-a-number', dayparts: 'lunch' }, // invalid: price not numeric
    ]);
    const jobId = await createPendingJob(filePath);

    const r = await processImportJob(fakeJob({ job_id: jobId, store_id: STORE_ID, raw_path: filePath }));
    expect(r.total).toBe(3);
    expect(r.valid).toBe(1);
    expect(r.invalid).toBe(2);

    const row = await pool.query(`SELECT status, errors, preview FROM menu_import_jobs WHERE id = $1`, [jobId]);
    expect(row.rows[0].status).toBe('preview_ready');
    expect(row.rows[0].errors.length).toBeGreaterThanOrEqual(2);
    expect(row.rows[0].preview).toHaveLength(1);
  });

  it('Empty workbook → status=failed', async () => {
    const filePath = await writeXlsx('empty.xlsx', []);
    const jobId = await createPendingJob(filePath);

    const r = await processImportJob(fakeJob({ job_id: jobId, store_id: STORE_ID, raw_path: filePath }));
    expect(r.total).toBe(0);

    const row = await pool.query(`SELECT status FROM menu_import_jobs WHERE id = $1`, [jobId]);
    expect(row.rows[0].status).toBe('failed');
  });

  it('Invalid spice_level → row marked invalid', async () => {
    const filePath = await writeXlsx('spice.xlsx', [
      { name_en: 'Curry', price_usd: 9.99, spice_level: 'volcanic' as unknown as string },
    ]);
    const jobId = await createPendingJob(filePath);

    const r = await processImportJob(fakeJob({ job_id: jobId, store_id: STORE_ID, raw_path: filePath }));
    expect(r).toEqual({ total: 1, valid: 0, invalid: 1 });

    const row = await pool.query(`SELECT errors FROM menu_import_jobs WHERE id = $1`, [jobId]);
    expect(row.rows[0].errors.some((e: { field?: string }) => e.field === 'spice_level')).toBe(true);
  });
});
