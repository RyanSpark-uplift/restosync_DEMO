import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

describe('Menu routes — validation', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/menu/items without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/menu/items' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/menu/items without auth → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/menu/items', payload: { name: 'Burger' } });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/menu/items with missing name → 400', async () => {
    const fakeJwt = app.jwt.sign({
      sub: '00000000-0000-0000-0000-000000000001',
      store_id: '00000000-0000-0000-0000-000000000001',
      role: 'staff',
      type: 'access',
    }, { expiresIn: '15m' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/menu/items',
      headers: { authorization: `Bearer ${fakeJwt}` },
      payload: { price: 9.99 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/menu/items with auth → 200 (empty array for unknown store)', async () => {
    const fakeJwt = app.jwt.sign({
      sub: '00000000-0000-0000-0000-000000000001',
      store_id: '00000000-0000-0000-0000-000000000001',
      role: 'staff',
      type: 'access',
    }, { expiresIn: '15m' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/menu/items',
      headers: { authorization: `Bearer ${fakeJwt}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('GET /api/menu/items/:id without auth → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/menu/items/00000000-0000-0000-0000-000000000001',
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/menu/items/:id with auth, unknown id → 404', async () => {
    const fakeJwt = app.jwt.sign({
      sub: '00000000-0000-0000-0000-000000000001',
      store_id: '00000000-0000-0000-0000-000000000001',
      role: 'staff',
      type: 'access',
    }, { expiresIn: '15m' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/menu/items/00000000-0000-0000-0000-0000000000ff',
      headers: { authorization: `Bearer ${fakeJwt}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'ITEM_NOT_FOUND' });
  });

  it('PATCH /api/menu/items/:id/toggle without auth → 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/menu/items/00000000-0000-0000-0000-000000000001/toggle',
    });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE /api/menu/items/:id without auth → 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/menu/items/00000000-0000-0000-0000-000000000001',
    });
    expect(res.statusCode).toBe(401);
  });
});
