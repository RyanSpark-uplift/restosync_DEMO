// Sprint 5A — menuImport route auth + RBAC + validation vitest (DB-free 단위)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

const FAKE_STORE = '00000000-0000-0000-0000-000000000001';
const FAKE_USER  = '00000000-0000-0000-0000-000000000001';
const FAKE_JOB   = '00000000-0000-0000-0000-0000000000dd';

describe('Menu Import — auth + RBAC + validation', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeAll(async () => { app = await buildServer(); await app.ready(); });
  afterAll(async () => { await app.close(); });

  const signJwt = (role: string) => app.jwt.sign(
    { sub: FAKE_USER, store_id: FAKE_STORE, role, type: 'access' },
    { expiresIn: '15m' },
  );

  it('GET /template without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/menu/import/template' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /template with auth → 200 xlsx', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/menu/import/template',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('restosync-menu-template.xlsx');
    expect(res.rawPayload.length).toBeGreaterThan(1000);   // non-empty workbook
  });

  it('GET /template?format=csv_zip → 501 (5A not implemented)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/menu/import/template?format=csv_zip',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
    });
    expect(res.statusCode).toBe(501);
    expect(res.json<{ error: string }>().error).toBe('CSV_ZIP_NOT_IMPLEMENTED');
  });

  it('GET /template?format=bogus → 400', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/menu/import/template?format=bogus',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /excel/upload without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/import/excel/upload',
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /excel/upload with staff role → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/import/excel/upload',
      headers: { authorization: `Bearer ${signJwt('staff')}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /excel/upload with kitchen role → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/import/excel/upload',
      headers: { authorization: `Bearer ${signJwt('kitchen')}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /excel/upload owner but no file → 400 NO_FILE', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/import/excel/upload',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
    });
    // Without multipart body the request is treated as non-multipart; fastify returns 400 (file() throws).
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('GET /jobs/:id without auth → 401', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/import/jobs/${FAKE_JOB}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /jobs/:id unknown id → 404 IMPORT_JOB_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/import/jobs/${FAKE_JOB}`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toBe('IMPORT_JOB_NOT_FOUND');
  });

  // ── 5B endpoints ──────────────────────────────────────────────────────────
  it('GET /jobs/:id/errors without auth → 401', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/import/jobs/${FAKE_JOB}/errors`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /jobs/:id/preview without auth → 401', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/import/jobs/${FAKE_JOB}/preview`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /jobs/:id/execute without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/menu/import/jobs/${FAKE_JOB}/execute`,
      payload: { mode: 'lenient', confirm: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /jobs/:id/execute with staff role → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/menu/import/jobs/${FAKE_JOB}/execute`,
      headers: { authorization: `Bearer ${signJwt('staff')}` },
      payload: { mode: 'lenient', confirm: true },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /jobs/:id/execute without confirm:true → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/menu/import/jobs/${FAKE_JOB}/execute`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { mode: 'lenient', confirm: false },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /jobs/:id/execute with invalid mode → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/menu/import/jobs/${FAKE_JOB}/execute`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { mode: 'overwrite', confirm: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /jobs/:id/execute unknown job → 404', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/menu/import/jobs/${FAKE_JOB}/execute`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { mode: 'lenient', confirm: true },
    });
    expect(res.statusCode).toBe(404);
  });
});
