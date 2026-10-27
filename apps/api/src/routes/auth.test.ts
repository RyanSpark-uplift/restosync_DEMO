import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

describe('POST /api/auth/login', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects empty body → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid uuid format → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { store_id: 'not-a-uuid', user_id: 'not-a-uuid', pin: '1234' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unknown user → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        store_id: '00000000-0000-0000-0000-000000000001',
        user_id:  '00000000-0000-0000-0000-000000000002',
        pin: '9999',
      },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects invalid token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refresh_token: 'invalid.token.here' },
    });
    expect(res.statusCode).toBe(401);
  });
});
