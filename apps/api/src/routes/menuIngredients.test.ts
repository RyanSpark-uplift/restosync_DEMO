// Sprint 4 S4.6 — menuIngredients route auth + validation + RBAC vitest
// Live-DB integration은 e2e/menuIngredients.integration.test.ts 참조.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

const FAKE_STORE      = '00000000-0000-0000-0000-000000000001';
const FAKE_USER       = '00000000-0000-0000-0000-000000000001';
const FAKE_INGREDIENT = '00000000-0000-0000-0000-0000000000cc';

describe('Menu Ingredients — auth + validation + RBAC', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeAll(async () => { app = await buildServer(); await app.ready(); });
  afterAll(async () => { await app.close(); });

  const signJwt = (role: string) => app.jwt.sign(
    { sub: FAKE_USER, store_id: FAKE_STORE, role, type: 'access' },
    { expiresIn: '15m' },
  );

  // ── Auth (401) ────────────────────────────────────────────────────────────
  it('GET /ingredients without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/menu/ingredients' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /ingredients/:id without auth → 401', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/ingredients/${FAKE_INGREDIENT}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /ingredients without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/ingredients',
      payload: { name: { en: 'Apple' }, unit: 'kg' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH /ingredients/:id/stock-adjust without auth → 401', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/ingredients/${FAKE_INGREDIENT}/stock-adjust`,
      payload: { mode: 'delta', delta: -1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE /ingredients/:id without auth → 401', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/api/menu/ingredients/${FAKE_INGREDIENT}`,
    });
    expect(res.statusCode).toBe(401);
  });

  // ── RBAC (403) ────────────────────────────────────────────────────────────
  it('POST /ingredients with staff role → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/ingredients',
      headers: { authorization: `Bearer ${signJwt('staff')}` },
      payload: { name: { en: 'Apple' }, unit: 'kg' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE /ingredients with kitchen role → 403', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/api/menu/ingredients/${FAKE_INGREDIENT}`,
      headers: { authorization: `Bearer ${signJwt('kitchen')}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('stock-adjust set mode with kitchen role → 403 FORBIDDEN_MODE', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/menu/ingredients/${FAKE_INGREDIENT}/stock-adjust`,
      headers: { authorization: `Bearer ${signJwt('kitchen')}` },
      payload: { mode: 'set', value: '10.500' },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('FORBIDDEN_MODE');
  });

  // ── Validation (400) ──────────────────────────────────────────────────────
  it('POST without name.en → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/ingredients',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { name: { ko: '토마토' }, unit: 'kg' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST with invalid unit → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/ingredients',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { name: { en: 'Apple' }, unit: 'pcs' },  // INGREDIENT_UNIT 외
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST with negative stock_quantity (number) → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/ingredients',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { name: { en: 'Apple' }, unit: 'kg', stock_quantity: -5 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /ingredients/:id with empty body → 400 EMPTY_PATCH', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/ingredients/${FAKE_INGREDIENT}`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('EMPTY_PATCH');
  });

  it('stock-adjust with unknown mode → 400', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/ingredients/${FAKE_INGREDIENT}/stock-adjust`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { mode: 'reset', value: '0' },  // not in discriminated union
    });
    expect(res.statusCode).toBe(400);
  });

  it('stock-adjust delta with non-numeric → 400', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/ingredients/${FAKE_INGREDIENT}/stock-adjust`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { mode: 'delta', delta: 'abc' },
    });
    expect(res.statusCode).toBe(400);
  });

  // ── Query (400) ───────────────────────────────────────────────────────────
  it('GET /ingredients with invalid unit query → 400', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/menu/ingredients?unit=bogus',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /ingredients with limit over 500 → 400', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/menu/ingredients?limit=9999',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
    });
    expect(res.statusCode).toBe(400);
  });

  // ── 404 (unknown id) ──────────────────────────────────────────────────────
  it('GET unknown ingredient → 404', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/ingredients/${FAKE_INGREDIENT}`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('INGREDIENT_NOT_FOUND');
  });

  it('PATCH unknown ingredient → 404', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/ingredients/${FAKE_INGREDIENT}`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { name: { en: 'X' } },
    });
    expect(res.statusCode).toBe(404);
  });

  it('stock-adjust unknown ingredient → 404', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/ingredients/${FAKE_INGREDIENT}/stock-adjust`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { mode: 'delta', delta: 1 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE unknown ingredient → 404', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/api/menu/ingredients/${FAKE_INGREDIENT}`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
