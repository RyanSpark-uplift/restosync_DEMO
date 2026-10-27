// Sprint 4 S4.5b — menuItemModifierGroups (attach/detach) vitest
// Auth + RBAC + 404 paths. DB-free (unknown store/item).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

const FAKE_STORE = '00000000-0000-0000-0000-000000000001';
const FAKE_USER  = '00000000-0000-0000-0000-000000000001';
const FAKE_ITEM  = '00000000-0000-0000-0000-0000000000aa';
const FAKE_GROUP = '00000000-0000-0000-0000-0000000000cc';

function signJwt(app: Awaited<ReturnType<typeof buildServer>>, role: string) {
  return app.jwt.sign(
    { sub: FAKE_USER, store_id: FAKE_STORE, role, type: 'access' },
    { expiresIn: '15m' },
  );
}

describe('Item ↔ ModifierGroup attach/detach', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeAll(async () => { app = await buildServer(); await app.ready(); });
  afterAll(async () => { await app.close(); });

  it('GET attached groups without auth → 401', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/items/${FAKE_ITEM}/modifier-groups`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST attach without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/menu/items/${FAKE_ITEM}/attach-modifier-group/${FAKE_GROUP}`,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE detach without auth → 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/menu/items/${FAKE_ITEM}/attach-modifier-group/${FAKE_GROUP}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET attached, unknown item → 404 ITEM_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/items/${FAKE_ITEM}/modifier-groups`,
      headers: { authorization: `Bearer ${signJwt(app, 'staff')}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'ITEM_NOT_FOUND' });
  });

  it('POST attach as staff → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/menu/items/${FAKE_ITEM}/attach-modifier-group/${FAKE_GROUP}`,
      headers: { authorization: `Bearer ${signJwt(app, 'staff')}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST attach owner, unknown item → 404 ITEM_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/menu/items/${FAKE_ITEM}/attach-modifier-group/${FAKE_GROUP}`,
      headers: { authorization: `Bearer ${signJwt(app, 'owner')}` },
      payload: { sort_order: 5 },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'ITEM_NOT_FOUND' });
  });

  it('POST attach with out-of-range sort_order → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/menu/items/${FAKE_ITEM}/attach-modifier-group/${FAKE_GROUP}`,
      headers: { authorization: `Bearer ${signJwt(app, 'owner')}` },
      payload: { sort_order: 999_999 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST attach with extra body field → 400 (strict)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/menu/items/${FAKE_ITEM}/attach-modifier-group/${FAKE_GROUP}`,
      headers: { authorization: `Bearer ${signJwt(app, 'owner')}` },
      payload: { sort_order: 1, junk: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE detach as staff → 403', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/menu/items/${FAKE_ITEM}/attach-modifier-group/${FAKE_GROUP}`,
      headers: { authorization: `Bearer ${signJwt(app, 'staff')}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE detach owner, unknown item → 404 ITEM_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/menu/items/${FAKE_ITEM}/attach-modifier-group/${FAKE_GROUP}`,
      headers: { authorization: `Bearer ${signJwt(app, 'owner')}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'ITEM_NOT_FOUND' });
  });
});
