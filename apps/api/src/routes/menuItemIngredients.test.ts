// Sprint 4 S4.6 — menuItemIngredients route auth + validation + RBAC vitest

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

const FAKE_STORE      = '00000000-0000-0000-0000-000000000001';
const FAKE_USER       = '00000000-0000-0000-0000-000000000001';
const FAKE_ITEM       = '00000000-0000-0000-0000-0000000000aa';
const FAKE_INGREDIENT = '00000000-0000-0000-0000-0000000000cc';

describe('Menu Item Recipe — auth + validation + RBAC', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeAll(async () => { app = await buildServer(); await app.ready(); });
  afterAll(async () => { await app.close(); });

  const signJwt = (role: string) => app.jwt.sign(
    { sub: FAKE_USER, store_id: FAKE_STORE, role, type: 'access' },
    { expiresIn: '15m' },
  );

  it('GET /items/:id/ingredients without auth → 401', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/items/${FAKE_ITEM}/ingredients`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('PUT /items/:id/recipe without auth → 401', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/menu/items/${FAKE_ITEM}/recipe`,
      payload: { lines: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('PUT recipe with staff role → 403', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/menu/items/${FAKE_ITEM}/recipe`,
      headers: { authorization: `Bearer ${signJwt('staff')}` },
      payload: { lines: [] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('PUT recipe with kitchen role → 403', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/menu/items/${FAKE_ITEM}/recipe`,
      headers: { authorization: `Bearer ${signJwt('kitchen')}` },
      payload: { lines: [] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET ingredients unknown item → 404 ITEM_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/items/${FAKE_ITEM}/ingredients`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('ITEM_NOT_FOUND');
  });

  it('PUT recipe with malformed line (missing quantity) → 400', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/menu/items/${FAKE_ITEM}/recipe`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { lines: [{ ingredient_id: FAKE_INGREDIENT, unit: 'kg' }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT recipe with invalid unit → 400', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/menu/items/${FAKE_ITEM}/recipe`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { lines: [{ ingredient_id: FAKE_INGREDIENT, quantity: 1, unit: 'pcs' }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT recipe with duplicate ingredient_id → 400', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/menu/items/${FAKE_ITEM}/recipe`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: {
        lines: [
          { ingredient_id: FAKE_INGREDIENT, quantity: 1, unit: 'kg' },
          { ingredient_id: FAKE_INGREDIENT, quantity: 2, unit: 'kg' },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT recipe with quantity = 0 → 400', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/menu/items/${FAKE_ITEM}/recipe`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { lines: [{ ingredient_id: FAKE_INGREDIENT, quantity: 0, unit: 'kg' }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT empty recipe with unknown item → 404', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/menu/items/${FAKE_ITEM}/recipe`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { lines: [] },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('ITEM_NOT_FOUND');
  });
});
