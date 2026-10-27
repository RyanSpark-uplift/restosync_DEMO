// Sprint 1 S1.14 — menuCategories routes vitest
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

const FAKE_STORE = '00000000-0000-0000-0000-000000000001';
const FAKE_USER  = '00000000-0000-0000-0000-000000000001';

describe('Menu Categories — auth + validation', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeAll(async () => { app = await buildServer(); await app.ready(); });
  afterAll(async () => { await app.close(); });

  it('GET /api/menu/categories without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/menu/categories' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/menu/categories without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/categories',
      payload: { name: { en: 'X' } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/menu/categories with auth → 200 array', async () => {
    const jwt = app.jwt.sign({ sub: FAKE_USER, store_id: FAKE_STORE, role: 'staff', type: 'access' }, { expiresIn: '15m' });
    const res = await app.inject({
      method: 'GET', url: '/api/menu/categories',
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  it('POST without owner/manager role → 403', async () => {
    const jwt = app.jwt.sign({ sub: FAKE_USER, store_id: FAKE_STORE, role: 'staff', type: 'access' }, { expiresIn: '15m' });
    const res = await app.inject({
      method: 'POST', url: '/api/menu/categories',
      headers: { authorization: `Bearer ${jwt}` },
      payload: { name: { en: 'Chicken' } },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST with invalid body (missing name.en) → 400', async () => {
    const jwt = app.jwt.sign({ sub: FAKE_USER, store_id: FAKE_STORE, role: 'owner', type: 'access' }, { expiresIn: '15m' });
    const res = await app.inject({
      method: 'POST', url: '/api/menu/categories',
      headers: { authorization: `Bearer ${jwt}` },
      payload: { name: { ko: 'no en' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /reorder without auth → 401', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/menu/categories/reorder',
      payload: { orders: [] },
    });
    expect(res.statusCode).toBe(401);
  });
});
