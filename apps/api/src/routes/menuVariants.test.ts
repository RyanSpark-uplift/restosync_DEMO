// Sprint 4 S4.5b — menuVariants routes vitest
// Auth + validation + RBAC checks. DB-free (unknown store/item → empty/404).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

const FAKE_STORE   = '00000000-0000-0000-0000-000000000001';
const FAKE_USER    = '00000000-0000-0000-0000-000000000001';
const FAKE_ITEM    = '00000000-0000-0000-0000-0000000000aa';
const FAKE_VARIANT = '00000000-0000-0000-0000-0000000000bb';

describe('Menu Variants — auth + validation + RBAC', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeAll(async () => { app = await buildServer(); await app.ready(); });
  afterAll(async () => { await app.close(); });

  it('GET variants without auth → 401', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/items/${FAKE_ITEM}/variants`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST variants without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/menu/items/${FAKE_ITEM}/variants`,
      payload: { name: { en: 'Small' } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH variant without auth → 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/menu/items/${FAKE_ITEM}/variants/${FAKE_VARIANT}`,
      payload: { price_delta_cents: 100 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE variant without auth → 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/menu/items/${FAKE_ITEM}/variants/${FAKE_VARIANT}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET variants with auth, unknown item → 404', async () => {
    const jwt = app.jwt.sign(
      { sub: FAKE_USER, store_id: FAKE_STORE, role: 'staff', type: 'access' },
      { expiresIn: '15m' },
    );
    const res = await app.inject({
      method: 'GET', url: `/api/menu/items/${FAKE_ITEM}/variants`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'ITEM_NOT_FOUND' });
  });

  it('POST without owner/manager role → 403', async () => {
    const jwt = app.jwt.sign(
      { sub: FAKE_USER, store_id: FAKE_STORE, role: 'staff', type: 'access' },
      { expiresIn: '15m' },
    );
    const res = await app.inject({
      method: 'POST', url: `/api/menu/items/${FAKE_ITEM}/variants`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { name: { en: 'Small' } },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST with invalid body (missing name.en) → 400', async () => {
    const jwt = app.jwt.sign(
      { sub: FAKE_USER, store_id: FAKE_STORE, role: 'owner', type: 'access' },
      { expiresIn: '15m' },
    );
    const res = await app.inject({
      method: 'POST', url: `/api/menu/items/${FAKE_ITEM}/variants`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { name: { ko: 'no en' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST with out-of-range price_delta_cents → 400', async () => {
    const jwt = app.jwt.sign(
      { sub: FAKE_USER, store_id: FAKE_STORE, role: 'owner', type: 'access' },
      { expiresIn: '15m' },
    );
    const res = await app.inject({
      method: 'POST', url: `/api/menu/items/${FAKE_ITEM}/variants`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { name: { en: 'XL' }, price_delta_cents: 99_999_999 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST owner+valid body, unknown item → 404 ITEM_NOT_FOUND', async () => {
    const jwt = app.jwt.sign(
      { sub: FAKE_USER, store_id: FAKE_STORE, role: 'owner', type: 'access' },
      { expiresIn: '15m' },
    );
    const res = await app.inject({
      method: 'POST', url: `/api/menu/items/${FAKE_ITEM}/variants`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { name: { en: 'Small' }, price_delta_cents: -100 },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'ITEM_NOT_FOUND' });
  });

  it('PATCH with empty body → 400 EMPTY_PATCH (after item check skipped via 404 path)', async () => {
    const jwt = app.jwt.sign(
      { sub: FAKE_USER, store_id: FAKE_STORE, role: 'owner', type: 'access' },
      { expiresIn: '15m' },
    );
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/menu/items/${FAKE_ITEM}/variants/${FAKE_VARIANT}`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'EMPTY_PATCH' });
  });

  it('PATCH staff role → 403', async () => {
    const jwt = app.jwt.sign(
      { sub: FAKE_USER, store_id: FAKE_STORE, role: 'staff', type: 'access' },
      { expiresIn: '15m' },
    );
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/menu/items/${FAKE_ITEM}/variants/${FAKE_VARIANT}`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { is_default: true },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE staff role → 403', async () => {
    const jwt = app.jwt.sign(
      { sub: FAKE_USER, store_id: FAKE_STORE, role: 'staff', type: 'access' },
      { expiresIn: '15m' },
    );
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/menu/items/${FAKE_ITEM}/variants/${FAKE_VARIANT}`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
