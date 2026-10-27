import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

describe('Events routes — validation', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/events without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/events' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/events/active without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/events/active' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/events without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { title: 'Happy Hour', type: 'happy_hour' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/events with missing type → 400', async () => {
    const fakeJwt = app.jwt.sign({
      sub: '00000000-0000-0000-0000-000000000001',
      store_id: '00000000-0000-0000-0000-000000000001',
      role: 'staff',
      type: 'access',
    }, { expiresIn: '15m' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { authorization: `Bearer ${fakeJwt}` },
      payload: { title: 'Happy Hour' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/events/active with auth → 200 (empty for unknown store)', async () => {
    const fakeJwt = app.jwt.sign({
      sub: '00000000-0000-0000-0000-000000000001',
      store_id: '00000000-0000-0000-0000-000000000001',
      role: 'staff',
      type: 'access',
    }, { expiresIn: '15m' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/events/active',
      headers: { authorization: `Bearer ${fakeJwt}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });
});
