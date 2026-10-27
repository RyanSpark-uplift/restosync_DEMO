import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

describe('Screens routes — validation', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/screens without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/screens' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/screens without auth → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/screens', payload: { role: 'menu' } });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/screens/:id/pair without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/screens/00000000-0000-0000-0000-000000000001/pair',
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/screens/claim without body → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/screens/claim',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/screens/claim with invalid code → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/screens/claim',
      payload: { pairing_code: '000000' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/screens/:id/heartbeat with unknown id → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/screens/00000000-0000-0000-0000-000000000001/heartbeat',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });
});
