// Sprint 4 S4.5b — menuModifierGroups routes vitest
// Auth + validation + RBAC + Zod refine (BR-17 is_required/min_select) checks.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

const FAKE_STORE  = '00000000-0000-0000-0000-000000000001';
const FAKE_USER   = '00000000-0000-0000-0000-000000000001';
const FAKE_GROUP  = '00000000-0000-0000-0000-0000000000cc';
const FAKE_OPTION = '00000000-0000-0000-0000-0000000000dd';

function signJwt(app: Awaited<ReturnType<typeof buildServer>>, role: string) {
  return app.jwt.sign(
    { sub: FAKE_USER, store_id: FAKE_STORE, role, type: 'access' },
    { expiresIn: '15m' },
  );
}

describe('Modifier Groups — auth + validation + refines', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeAll(async () => { app = await buildServer(); await app.ready(); });
  afterAll(async () => { await app.close(); });

  it('GET groups without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/menu/modifier-groups' });
    expect(res.statusCode).toBe(401);
  });

  it('POST group without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/modifier-groups',
      payload: { name: { en: 'Toppings' } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET groups with auth → 200 array (empty for unknown store)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/menu/modifier-groups',
      headers: { authorization: `Bearer ${signJwt(app, 'staff')}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('GET single group, unknown id → 404', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/modifier-groups/${FAKE_GROUP}`,
      headers: { authorization: `Bearer ${signJwt(app, 'staff')}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'MODIFIER_GROUP_NOT_FOUND' });
  });

  it('POST group as staff → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/modifier-groups',
      headers: { authorization: `Bearer ${signJwt(app, 'staff')}` },
      payload: { name: { en: 'Toppings' } },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST group missing name.en → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/modifier-groups',
      headers: { authorization: `Bearer ${signJwt(app, 'owner')}` },
      payload: { name: { ko: 'no en' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST group with is_required=true && min_select=0 → 400 (Zod refine)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/modifier-groups',
      headers: { authorization: `Bearer ${signJwt(app, 'owner')}` },
      payload: { name: { en: 'Sauce' }, is_required: true, min_select: 0 },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('INVALID_BODY');
  });

  it('POST group with max_select < min_select → 400 (Zod refine)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/modifier-groups',
      headers: { authorization: `Bearer ${signJwt(app, 'owner')}` },
      payload: { name: { en: 'Sauce' }, min_select: 3, max_select: 1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH group with empty body → 400 EMPTY_PATCH', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/modifier-groups/${FAKE_GROUP}`,
      headers: { authorization: `Bearer ${signJwt(app, 'owner')}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'EMPTY_PATCH' });
  });

  it('PATCH group as staff → 403', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/modifier-groups/${FAKE_GROUP}`,
      headers: { authorization: `Bearer ${signJwt(app, 'staff')}` },
      payload: { is_required: true },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE group as staff → 403', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/api/menu/modifier-groups/${FAKE_GROUP}`,
      headers: { authorization: `Bearer ${signJwt(app, 'staff')}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE unknown group → 404', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/api/menu/modifier-groups/${FAKE_GROUP}`,
      headers: { authorization: `Bearer ${signJwt(app, 'owner')}` },
    });
    expect(res.statusCode).toBe(404);
  });

  // ── options sub-routes ─────────────────────────────────────────────────────

  it('POST option without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/menu/modifier-groups/${FAKE_GROUP}/options`,
      payload: { name: { en: 'Cheese' } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST option missing name.en → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/menu/modifier-groups/${FAKE_GROUP}/options`,
      headers: { authorization: `Bearer ${signJwt(app, 'owner')}` },
      payload: { name: { ko: 'no en' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST option, unknown group → 404 MODIFIER_GROUP_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/menu/modifier-groups/${FAKE_GROUP}/options`,
      headers: { authorization: `Bearer ${signJwt(app, 'owner')}` },
      payload: { name: { en: 'Cheese' }, price_delta_cents: 150 },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'MODIFIER_GROUP_NOT_FOUND' });
  });

  it('PATCH option staff → 403', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/menu/modifier-groups/${FAKE_GROUP}/options/${FAKE_OPTION}`,
      headers: { authorization: `Bearer ${signJwt(app, 'staff')}` },
      payload: { is_default: true },
    });
    expect(res.statusCode).toBe(403);
  });

  it('PATCH option with empty body → 400 EMPTY_PATCH', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/menu/modifier-groups/${FAKE_GROUP}/options/${FAKE_OPTION}`,
      headers: { authorization: `Bearer ${signJwt(app, 'owner')}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'EMPTY_PATCH' });
  });

  it('DELETE option, unknown group → 404 MODIFIER_GROUP_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/menu/modifier-groups/${FAKE_GROUP}/options/${FAKE_OPTION}`,
      headers: { authorization: `Bearer ${signJwt(app, 'owner')}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'MODIFIER_GROUP_NOT_FOUND' });
  });
});
