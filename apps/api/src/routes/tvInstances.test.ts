import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

describe('TV Instances routes — validation', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth-required endpoints → 401 ─────────────────────────────────────────

  it('GET /api/tv-instances without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tv-instances' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/tv-instances without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tv-instances',
      payload: { function_type: 'menu' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH /api/tv-instances/:id/profile without auth → 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/tv-instances/00000000-0000-0000-0000-000000000001/profile',
      payload: { profile_id: '00000000-0000-0000-0000-000000000002' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE /api/tv-instances/:id without auth → 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/tv-instances/00000000-0000-0000-0000-000000000001',
    });
    expect(res.statusCode).toBe(401);
  });

  // ── POST body validation (schema check, no DB hit) ───────────────────────

  it('POST /api/tv-instances with missing function_type → 400', async () => {
    const fakeJwt = app.jwt.sign({
      sub: '00000000-0000-0000-0000-000000000001',
      store_id: '00000000-0000-0000-0000-000000000001',
      role: 'staff',
      type: 'access',
    }, { expiresIn: '15m' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/tv-instances',
      headers: { authorization: `Bearer ${fakeJwt}` },
      payload: { display_name: 'Main Menu TV' },
    });
    expect(res.statusCode).toBe(400);
  });
});
