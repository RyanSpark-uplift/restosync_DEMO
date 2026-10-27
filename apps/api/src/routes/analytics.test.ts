import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

describe('Analytics — auth + shape', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/analytics/orders without auth -> 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/analytics/orders' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/analytics/orders with auth returns metrics shape', async () => {
    const jwt = app.jwt.sign({
      sub: '00000000-0000-0000-0000-000000000001',
      store_id: '00000000-0000-0000-0000-000000000001',
      role: 'staff', type: 'access',
    }, { expiresIn: '15m' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/analytics/orders',
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('avg_wait_seconds');
    expect(body).toHaveProperty('pickup_rate_pct');
    expect(body).toHaveProperty('expired_rate_pct');
    expect(body).toHaveProperty('per_hour');
    expect(typeof body.total).toBe('number');
  });
});
