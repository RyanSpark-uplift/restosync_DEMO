// Sprint 5A — live-DB integration tests for menu import (template DL + upload + status)
// Worker is NOT spawned (NODE_ENV=test → BullMQ no-op); jobs remain in 'pending'.
// Real validation is exercised in importWorker.test.ts.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import ExcelJS from 'exceljs';
import { buildServer } from '../server';
import type { FastifyInstance } from 'fastify';

// Hand-built RFC 7578 multipart writer — avoids form-data lib (AG-017 not approved).
function buildMultipart(filename: string, contentType: string, fileBuf: Buffer): {
  body: Buffer; headers: Record<string, string>;
} {
  const boundary = '----RS-Import-' + Math.random().toString(36).slice(2);
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
    ),
    fileBuf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

const DB_URL   = process.env.DATABASE_URL ?? 'postgresql://rs_user:rs_pass@localhost:5432/restosync';
const STORE_ID = '97313de4-f52c-4381-91dd-cbc491b58943';

let app: FastifyInstance;
let jwt: string;

async function login(): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const r = await pool.query(
    `SELECT id FROM users WHERE store_id = $1 AND name = 'Ryan' LIMIT 1`,
    [STORE_ID],
  );
  await pool.end();
  if (!r.rows.length) throw new Error('Seed user not found');
  const userId = r.rows[0].id as string;

  const res = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { store_id: STORE_ID, user_id: userId, pin: '1234' },
  });
  if (res.statusCode !== 200) throw new Error(`Login failed ${res.statusCode}: ${res.body}`);
  return res.json<{ access_token: string }>().access_token;
}

async function purgeJobs(): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  try {
    await pool.query(`DELETE FROM menu_import_jobs WHERE store_id = $1`, [STORE_ID]);
  } finally {
    await pool.end();
  }
}

async function buildMinimalXlsx(rows: Array<Record<string, unknown>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('items');
  sheet.columns = [
    { key: 'name_en',   header: 'name_en' },
    { key: 'price_usd', header: 'price_usd' },
    { key: 'dayparts',  header: 'dayparts' },
  ];
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

beforeAll(async () => {
  process.env.DATABASE_URL = DB_URL;
  process.env.NODE_ENV = 'test';
  await purgeJobs();
  app = await buildServer();
  await app.ready();
  jwt = await login();
}, 30_000);

afterAll(async () => {
  await purgeJobs();
  await app.close();
});

describe('S5A — Template DL', () => {
  it('GET /template → 200 valid xlsx (parseable by ExcelJS)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/menu/import/template',
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(200);

    const wb = new ExcelJS.Workbook();
    // Buffer<ArrayBufferLike> → coerce via Uint8Array
    await wb.xlsx.load(new Uint8Array(res.rawPayload).buffer as ArrayBuffer);
    const items = wb.getWorksheet('items');
    expect(items).toBeTruthy();
    expect(items!.getRow(1).getCell(1).value).toMatch(/name_en/);
    expect(wb.getWorksheet('README')).toBeTruthy();
  });
});

describe('S5A — Upload + BR-33 active-job guard', () => {
  let firstJobId: string;

  it('POST /excel/upload accepts a small xlsx → 202 with job_id', async () => {
    const xlsx = await buildMinimalXlsx([
      { name_en: 'Pizza', price_usd: 12.99, dayparts: 'lunch,dinner' },
    ]);
    const mp = buildMultipart('test.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsx);

    const res = await app.inject({
      method: 'POST', url: '/api/menu/import/excel/upload',
      headers: { authorization: `Bearer ${jwt}`, ...mp.headers },
      payload: mp.body,
    });
    expect(res.statusCode).toBe(202);
    const body = res.json<{ job_id: string; status: string }>();
    expect(body.job_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.status).toBe('pending');
    firstJobId = body.job_id;
  });

  it('GET /jobs/:id returns the job row', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/import/jobs/${firstJobId}`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; status: string; source: string; filename: string }>();
    expect(body.id).toBe(firstJobId);
    expect(body.source).toBe('excel');
    expect(body.filename).toBe('test.xlsx');
    // worker not started in test env → still pending
    expect(['pending', 'validating', 'preview_ready']).toContain(body.status);
  });

  it('Second upload while first job is active → 409 IMPORT_JOB_ACTIVE (BR-33)', async () => {
    const xlsx = await buildMinimalXlsx([{ name_en: 'B', price_usd: 1, dayparts: '' }]);
    const mp = buildMultipart('second.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsx);

    const res = await app.inject({
      method: 'POST', url: '/api/menu/import/excel/upload',
      headers: { authorization: `Bearer ${jwt}`, ...mp.headers },
      payload: mp.body,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: string }>().error).toBe('IMPORT_JOB_ACTIVE');
  });

  it('Reject non-xlsx upload → 415 UNSUPPORTED_TYPE', async () => {
    // First clear the active job by marking it cancelled.
    const pool = new Pool({ connectionString: DB_URL });
    await pool.query(
      `UPDATE menu_import_jobs SET status = 'cancelled', finished_at = now() WHERE id = $1`,
      [firstJobId],
    );
    await pool.end();

    const mp = buildMultipart('evil.txt', 'text/plain', Buffer.from('not a spreadsheet'));
    const res = await app.inject({
      method: 'POST', url: '/api/menu/import/excel/upload',
      headers: { authorization: `Bearer ${jwt}`, ...mp.headers },
      payload: mp.body,
    });
    expect(res.statusCode).toBe(415);
  });
});

describe('S5B — Execute (transaction) end-to-end', () => {
  const NAME_TAG = 'S5B-INT-';
  let jobId: string;
  let createdItemIds: string[] = [];

  // Helper: insert a preview_ready job with hand-crafted preview rows (worker would do this normally).
  async function seedPreviewReadyJob(preview: Array<Record<string, unknown>>, invalid_rows = 0): Promise<string> {
    const pool = new Pool({ connectionString: DB_URL });
    try {
      await pool.query(`DELETE FROM menu_import_jobs WHERE store_id = $1`, [STORE_ID]);
      const r = await pool.query(
        `SELECT id FROM users WHERE store_id = $1 AND name = 'Ryan' LIMIT 1`,
        [STORE_ID],
      );
      const userId = r.rows[0].id;
      const ins = await pool.query(
        `INSERT INTO menu_import_jobs
           (store_id, user_id, source, status, total_rows, valid_rows, invalid_rows, preview)
         VALUES ($1, $2, 'excel', 'preview_ready', $3, $4, $5, $6::jsonb)
         RETURNING id`,
        [STORE_ID, userId, preview.length + invalid_rows, preview.length, invalid_rows, JSON.stringify(preview)],
      );
      return ins.rows[0].id;
    } finally {
      await pool.end();
    }
  }

  async function purgeImportedItems(): Promise<void> {
    const pool = new Pool({ connectionString: DB_URL });
    try {
      await pool.query(
        `DELETE FROM menu_items WHERE store_id = $1 AND (name_i18n->>'en') LIKE $2`,
        [STORE_ID, `${NAME_TAG}%`],
      );
      await pool.query(
        `DELETE FROM menu_categories WHERE store_id = $1 AND (name->>'en') LIKE $2`,
        [STORE_ID, `${NAME_TAG}%`],
      );
    } finally {
      await pool.end();
    }
  }

  beforeAll(async () => { await purgeImportedItems(); });
  afterAll(async () => { await purgeImportedItems(); });

  it('Strict mode + invalid_rows>0 → 422 STRICT_MODE_HAS_ERRORS', async () => {
    jobId = await seedPreviewReadyJob(
      [{ name_en: `${NAME_TAG}OK`, price_usd: 999, dayparts: 'lunch' }],
      2,  // pretend 2 invalid rows
    );

    const res = await app.inject({
      method: 'POST', url: `/api/menu/import/jobs/${jobId}/execute`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { mode: 'strict', confirm: true },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json<{ error: string }>().error).toBe('STRICT_MODE_HAS_ERRORS');
  });

  it('Lenient mode inserts new items + auto-creates category', async () => {
    jobId = await seedPreviewReadyJob([
      { name_en: `${NAME_TAG}Pizza`, price_usd: 1299, dayparts: 'lunch,dinner',
        category_en: `${NAME_TAG}Pizza`, allergens: 'milk,wheat', calories: 800, spice_level: 'mild' },
      { name_en: `${NAME_TAG}Salad`, price_usd: 850, dayparts: 'lunch',
        category_en: `${NAME_TAG}Pizza` },                                       // same category
    ]);

    const res = await app.inject({
      method: 'POST', url: `/api/menu/import/jobs/${jobId}/execute`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { mode: 'lenient', confirm: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; inserted: number; updated: number; mode: string }>();
    expect(body.status).toBe('completed');
    expect(body.inserted).toBe(2);
    expect(body.updated).toBe(0);
    expect(body.mode).toBe('lenient');

    // Verify rows actually written
    const pool = new Pool({ connectionString: DB_URL });
    const r = await pool.query(
      `SELECT id, name_i18n, price_cents, dayparts_arr, allergens, category_id
       FROM menu_items WHERE store_id = $1 AND (name_i18n->>'en') LIKE $2
       ORDER BY name_i18n->>'en'`,
      [STORE_ID, `${NAME_TAG}%`],
    );
    const cats = await pool.query(
      `SELECT id FROM menu_categories WHERE store_id = $1 AND (name->>'en') = $2`,
      [STORE_ID, `${NAME_TAG}Pizza`],
    );
    await pool.end();

    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].price_cents).toBe(1299);
    expect(r.rows[0].dayparts_arr).toEqual(['lunch', 'dinner']);
    expect(r.rows[0].allergens).toEqual(['milk', 'wheat']);
    expect(cats.rows).toHaveLength(1);
    expect(r.rows[0].category_id).toBe(cats.rows[0].id);
    expect(r.rows[1].category_id).toBe(cats.rows[0].id);   // shared category
    createdItemIds = r.rows.map((x: { id: string }) => x.id);
  });

  it('Re-execute with same external_id → updates existing rows (BR-26 upsert)', async () => {
    // Tag one item with an external_id by re-running execute with external_id supplied,
    // then again with the same external_id but different price → expect 'updated'.
    jobId = await seedPreviewReadyJob([
      { name_en: `${NAME_TAG}Soup-v1`, price_usd: 500, external_id: 'POS-SOUP-1' },
    ]);

    let res = await app.inject({
      method: 'POST', url: `/api/menu/import/jobs/${jobId}/execute`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { mode: 'lenient', confirm: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ inserted: number }>().inserted).toBe(1);

    // Second job, same external_id but updated price
    jobId = await seedPreviewReadyJob([
      { name_en: `${NAME_TAG}Soup-v2`, price_usd: 650, external_id: 'POS-SOUP-1' },
    ]);
    res = await app.inject({
      method: 'POST', url: `/api/menu/import/jobs/${jobId}/execute`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { mode: 'lenient', confirm: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ inserted: number; updated: number }>();
    expect(body.inserted).toBe(0);
    expect(body.updated).toBe(1);

    // Verify only one row exists, with the new price.
    const pool = new Pool({ connectionString: DB_URL });
    const r = await pool.query(
      `SELECT name_i18n->>'en' as name, price_cents
       FROM menu_items WHERE store_id = $1 AND external_id = $2 AND deleted_at IS NULL`,
      [STORE_ID, 'POS-SOUP-1'],
    );
    await pool.end();
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].name).toBe(`${NAME_TAG}Soup-v2`);
    expect(r.rows[0].price_cents).toBe(650);
  });

  it('Execute on non preview_ready job → 409 INVALID_STATE', async () => {
    // Re-execute the completed job from previous test.
    const res = await app.inject({
      method: 'POST', url: `/api/menu/import/jobs/${jobId}/execute`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { mode: 'lenient', confirm: true },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: string }>().error).toBe('INVALID_STATE');
  });

  it('GET /jobs/:id/errors returns CSV', async () => {
    const id = await seedPreviewReadyJob([], 0);
    // Inject a job with errors directly.
    const pool = new Pool({ connectionString: DB_URL });
    await pool.query(
      `UPDATE menu_import_jobs SET errors = $1::jsonb WHERE id = $2`,
      [JSON.stringify([{ row: 2, field: 'price_usd', message: 'invalid' }]), id],
    );
    await pool.end();

    const res = await app.inject({
      method: 'GET', url: `/api/menu/import/jobs/${id}/errors`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body).toContain('row,field,message');
    expect(res.body).toContain('2,price_usd,invalid');
  });

  it('GET /jobs/:id/preview returns rows', async () => {
    const id = await seedPreviewReadyJob([
      { name_en: `${NAME_TAG}Preview-A`, price_usd: 100 },
    ]);
    const res = await app.inject({
      method: 'GET', url: `/api/menu/import/jobs/${id}/preview`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; rows: Array<{ name_en: string }> }>();
    expect(body.status).toBe('preview_ready');
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].name_en).toContain('Preview-A');
  });

  // Silence unused-var on createdItemIds — kept for future cleanup assertions.
  void createdItemIds;
});
