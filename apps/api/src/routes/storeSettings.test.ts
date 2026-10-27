import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

describe('Store settings — auth + shape', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/store_settings without auth -> 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/store_settings' });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH /api/store_settings without auth -> 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/store_settings',
      payload: { theme: { mode: 'light' } },
    });
    expect(res.statusCode).toBe(401);
  });

  // Authenticated path requires DB seed of a valid store row. We rely on the existing
  // seed (1 store, 6 users — verified at preflight) and a known store_id fixture.
  it('GET /api/store_settings with auth returns default-merged config', async () => {
    const jwt = app.jwt.sign({
      sub: '00000000-0000-0000-0000-000000000001',
      store_id: '00000000-0000-0000-0000-000000000001',
      role: 'staff',
      type: 'access',
    }, { expiresIn: '15m' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/store_settings',
      headers: { authorization: `Bearer ${jwt}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // default shape sanity — top-level keys present.
    expect(body.theme).toBeDefined();
    expect(body.timeout).toBeDefined();
    expect(body.audio).toBeDefined();
    expect(body.daypart).toBeDefined();
    expect(body.display).toBeDefined();
    expect(body.accept).toBeDefined();
    expect(body.bilingual).toBeDefined();
    expect(body.per_tv).toEqual({});
  });
});
