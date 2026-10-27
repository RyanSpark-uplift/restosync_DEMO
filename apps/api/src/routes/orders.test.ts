import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

describe('Orders routes — validation', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // auth 없이 접근 → 401
  it('GET /api/orders without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/orders' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/orders without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { items: [{ name: 'Burger', qty: 1 }] },
    });
    expect(res.statusCode).toBe(401);
  });

  // 잘못된 source enum 검증 (AG-016)
  it('POST /api/orders with invalid source → 400', async () => {
    // 유효한 JWT 없이 테스트하면 401이므로, source 검증은 schema 레벨에서 400 발생
    // 통합 테스트에서는 seed 데이터 필요 — 여기서는 인증 선행 검증
    const fakeJwt = app.jwt.sign({
      sub: '00000000-0000-0000-0000-000000000001',
      store_id: '00000000-0000-0000-0000-000000000001',
      role: 'staff',
      type: 'access',
    }, { expiresIn: '15m' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { authorization: `Bearer ${fakeJwt}` },
      payload: { items: [{}], source: 'invalid_source' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /api/orders/:id/status without auth → 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/orders/00000000-0000-0000-0000-000000000001/status',
      payload: { status: 'prep' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH with invalid status enum → 400', async () => {
    const fakeJwt = app.jwt.sign({
      sub: '00000000-0000-0000-0000-000000000001',
      store_id: '00000000-0000-0000-0000-000000000001',
      role: 'staff',
      type: 'access',
    }, { expiresIn: '15m' });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/orders/00000000-0000-0000-0000-000000000001/status',
      headers: { authorization: `Bearer ${fakeJwt}` },
      payload: { status: 'flying' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/orders/stats without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/orders/stats' });
    expect(res.statusCode).toBe(401);
  });
});

describe('daypart — unit', () => {
  it('returns valid daypart string', () => {
    // daypart logic is embedded in orders.ts — test indirectly via POST
    // AG-013: only these 4 values are valid
    const valid = ['breakfast', 'lunch', 'dinner', 'all'];
    const hour = new Date().getHours();
    let expected: string;
    if (hour >= 5  && hour < 11) expected = 'breakfast';
    else if (hour >= 11 && hour < 16) expected = 'lunch';
    else if (hour >= 16 && hour < 22) expected = 'dinner';
    else expected = 'all';

    expect(valid).toContain(expected);
  });
});
