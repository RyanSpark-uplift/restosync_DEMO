// Sprint F.A — menuFeatured route auth + RBAC + Zod validation tests
// BR-21 / PRD §3.6 / FEATURED_RULE_TYPE 정본 검증

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

const FAKE_STORE = '00000000-0000-0000-0000-000000000001';
const FAKE_USER  = '00000000-0000-0000-0000-000000000001';

describe('Menu Featured — auth + RBAC + validation', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeAll(async () => { app = await buildServer(); await app.ready(); });
  afterAll(async () => { await app.close(); });

  const signJwt = (role: string) => app.jwt.sign(
    { sub: FAKE_USER, store_id: FAKE_STORE, role, type: 'access' },
    { expiresIn: '15m' },
  );

  // ── GET /current ────────────────────────────────────────────────────────────
  it('GET /current without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/menu/featured/current' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /current with bad limit → 422', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/menu/featured/current?limit=999',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
    });
    expect(res.statusCode).toBe(422);
  });

  // ── GET /rules ──────────────────────────────────────────────────────────────
  it('GET /rules without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/menu/featured/rules' });
    expect(res.statusCode).toBe(401);
  });

  // ── PUT /rules ──────────────────────────────────────────────────────────────
  it('PUT /rules without auth → 401', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/menu/featured/rules',
      payload: { rules: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('PUT /rules staff role → 403', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/menu/featured/rules',
      headers: { authorization: `Bearer ${signJwt('staff')}` },
      payload: { rules: [] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('PUT /rules kitchen role → 403', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/menu/featured/rules',
      headers: { authorization: `Bearer ${signJwt('kitchen')}` },
      payload: { rules: [] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('PUT /rules with invalid rule_type → 422', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/menu/featured/rules',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { rules: [{ rule_type: 'bogus_rule', is_active: true }] },
    });
    expect(res.statusCode).toBe(422);
  });

  it('PUT /rules with duplicate rule_type → 422', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/menu/featured/rules',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: {
        rules: [
          { rule_type: 'chef_pick', is_active: true },
          { rule_type: 'chef_pick', is_active: false },          // dup
        ],
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it('PUT /rules with invalid rotation_seconds (7) → 422', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/menu/featured/rules',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { rules: [], rotation_seconds: 7 },               // not in [5,8,10,12]
    });
    expect(res.statusCode).toBe(422);
  });

  it('PUT /rules with priority out of range → 422', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/menu/featured/rules',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: { rules: [{ rule_type: 'chef_pick', priority: 9999 }] },
    });
    expect(res.statusCode).toBe(422);
  });

  it('PUT /rules with unknown params field → 422 (strict schema)', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/menu/featured/rules',
      headers: { authorization: `Bearer ${signJwt('owner')}` },
      payload: {
        rules: [{ rule_type: 'lto', params: { not_a_real_field: 1 } }],
      },
    });
    expect(res.statusCode).toBe(422);
  });
});
