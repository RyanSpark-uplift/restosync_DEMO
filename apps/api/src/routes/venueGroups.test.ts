import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

describe('Venue Groups routes — validation', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth-required endpoints → 401 ─────────────────────────────────────────

  it('POST /api/venue-groups without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/venue-groups',
      payload: { name: 'Downtown Food Court', code: 'DFC001' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/venue-groups/:id/members without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/venue-groups/00000000-0000-0000-0000-000000000001/members',
      payload: { label: 'Burger Joint', color_hex: '#ff5500' },
    });
    expect(res.statusCode).toBe(401);
  });

  // ── POST body validation ──────────────────────────────────────────────────

  it('POST /api/venue-groups with missing name → 400', async () => {
    const fakeJwt = app.jwt.sign({
      sub: '00000000-0000-0000-0000-000000000001',
      store_id: '00000000-0000-0000-0000-000000000001',
      role: 'admin',
      type: 'access',
    }, { expiresIn: '15m' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/venue-groups',
      headers: { authorization: `Bearer ${fakeJwt}` },
      payload: { code: 'DFC001' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/venue-groups with missing code → 400', async () => {
    const fakeJwt = app.jwt.sign({
      sub: '00000000-0000-0000-0000-000000000001',
      store_id: '00000000-0000-0000-0000-000000000001',
      role: 'admin',
      type: 'access',
    }, { expiresIn: '15m' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/venue-groups',
      headers: { authorization: `Bearer ${fakeJwt}` },
      payload: { name: 'Downtown Food Court' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/venue-groups/:id/members with invalid color_hex → 400', async () => {
    const fakeJwt = app.jwt.sign({
      sub: '00000000-0000-0000-0000-000000000001',
      store_id: '00000000-0000-0000-0000-000000000001',
      role: 'staff',
      type: 'access',
    }, { expiresIn: '15m' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/venue-groups/00000000-0000-0000-0000-000000000001/members',
      headers: { authorization: `Bearer ${fakeJwt}` },
      payload: { label: 'Burger Joint', color_hex: 'not-a-color' },
    });
    expect(res.statusCode).toBe(400);
  });
});
