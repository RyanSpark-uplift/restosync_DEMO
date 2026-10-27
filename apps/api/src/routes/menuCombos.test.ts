// Sprint G.A — menuCombos route auth + RBAC + Zod validation tests
// PRD §4.2 Page G / §5.1 / BR-18/23 — DB-hit paths (BR-23 422, lifecycle)는 integration smoke에서.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

const FAKE_STORE = '00000000-0000-0000-0000-000000000001';
const FAKE_USER  = '00000000-0000-0000-0000-000000000001';
const FAKE_ITEM  = '00000000-0000-0000-0000-0000000000aa';
const FAKE_ITEM2 = '00000000-0000-0000-0000-0000000000bb';
const FAKE_COMBO = '00000000-0000-0000-0000-0000000000cc';

describe('Menu Combos — auth + RBAC + validation', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeAll(async () => { app = await buildServer(); await app.ready(); });
  afterAll(async () => { await app.close(); });

  const signJwt = (role: string) => app.jwt.sign(
    { sub: FAKE_USER, store_id: FAKE_STORE, role, type: 'access' },
    { expiresIn: '15m' },
  );

  const validBody = () => ({
    name:        { en: 'Combo A' },
    price_cents: 1000,
    items: [
      { item_id: FAKE_ITEM,  quantity: 1 },
      { item_id: FAKE_ITEM2, quantity: 1 },
    ],
  });

  // ── GET / ────────────────────────────────────────────────────────────────────
  it('GET / without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/menu/combos' });
    expect(res.statusCode).toBe(401);
  });

  it('GET / with invalid status filter → 422', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/menu/combos?status=bogus',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
    });
    expect(res.statusCode).toBe(422);
  });

  it('GET / with invalid daypart filter → 422', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/menu/combos?daypart=midnight',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
    });
    expect(res.statusCode).toBe(422);
  });

  // ── GET /:id ─────────────────────────────────────────────────────────────────
  it('GET /:id without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/menu/combos/${FAKE_COMBO}` });
    expect(res.statusCode).toBe(401);
  });

  // ── POST ─────────────────────────────────────────────────────────────────────
  it('POST without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/combos', payload: validBody(),
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST as staff → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/combos', payload: validBody(),
      headers: { authorization: `Bearer ${signJwt('staff')}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST as kitchen → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/combos', payload: validBody(),
      headers: { authorization: `Bearer ${signJwt('kitchen')}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST with missing name.en → 422', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/combos',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { ...validBody(), name: {} },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST with price_cents=0 → 422 (must be > 0)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/combos',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { ...validBody(), price_cents: 0 },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST with empty items → 422', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/combos',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { ...validBody(), items: [] },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST with duplicate item_id → 422 (AG-018 refine)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/combos',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: {
        ...validBody(),
        items: [
          { item_id: FAKE_ITEM, quantity: 1 },
          { item_id: FAKE_ITEM, quantity: 2 },          // dup
        ],
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST with invalid daypart → 422 (AG-013 정본)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/combos',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { ...validBody(), dayparts_arr: ['midnight'] },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST with quantity=0 → 422', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/combos',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: {
        ...validBody(),
        items: [{ item_id: FAKE_ITEM, quantity: 0 }],
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST with too many items (>20) → 422', async () => {
    const items = Array.from({ length: 21 }, (_, i) => ({
      item_id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      quantity: 1,
    }));
    const res = await app.inject({
      method: 'POST', url: '/api/menu/combos',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { ...validBody(), items },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST with unknown body field → 422 (strict)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/combos',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { ...validBody(), unknown_field: 'bogus' },
    });
    expect(res.statusCode).toBe(422);
  });

  // ── PATCH ────────────────────────────────────────────────────────────────────
  it('PATCH without auth → 401', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/combos/${FAKE_COMBO}`, payload: { price_cents: 500 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH as staff → 403', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/combos/${FAKE_COMBO}`,
      headers: { authorization: `Bearer ${signJwt('staff')}` },
      payload: { price_cents: 500 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('PATCH with empty body → 422 (at least one field)', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/combos/${FAKE_COMBO}`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: {},
    });
    expect(res.statusCode).toBe(422);
  });

  it('PATCH with invalid price_cents (negative) → 422', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/combos/${FAKE_COMBO}`,
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { price_cents: -1 },
    });
    expect(res.statusCode).toBe(422);
  });

  // ── DELETE ───────────────────────────────────────────────────────────────────
  it('DELETE without auth → 401', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/api/menu/combos/${FAKE_COMBO}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE as staff → 403', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/api/menu/combos/${FAKE_COMBO}`,
      headers: { authorization: `Bearer ${signJwt('staff')}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
