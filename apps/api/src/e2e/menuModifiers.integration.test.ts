// Sprint 4 S4.5b — live-DB integration tests for variants + modifier groups + attach
// Mirrors e2e.test.ts setup. Requires `docker compose up` (PG + Redis).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { buildServer } from '../server';
import type { FastifyInstance } from 'fastify';

const DB_URL   = process.env.DATABASE_URL ?? 'postgresql://rs_user:rs_pass@localhost:5432/restosync';
const STORE_ID = '97313de4-f52c-4381-91dd-cbc491b58943';
const ITEM_TAG = 'S4.5B-INT-';

let app: FastifyInstance;
let jwt: string;

async function login(): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const r = await pool.query(
    `SELECT id FROM users WHERE store_id = $1 AND name = 'Ryan' LIMIT 1`,
    [STORE_ID],
  );
  await pool.end();
  if (!r.rows.length) throw new Error('Seed user not found');
  const userId = r.rows[0].id as string;

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { store_id: STORE_ID, user_id: userId, pin: '1234' },
  });
  if (res.statusCode !== 200) throw new Error(`Login failed ${res.statusCode}: ${res.body}`);
  return res.json<{ access_token: string }>().access_token;
}

async function purgeFixtures(): Promise<void> {
  // Hard-drop test rows (cascades through FK). Identify by name_i18n.en LIKE prefix.
  const pool = new Pool({ connectionString: DB_URL });
  try {
    await pool.query(`DELETE FROM menu_items WHERE store_id = $1 AND (name_i18n->>'en') LIKE $2`, [STORE_ID, `${ITEM_TAG}%`]);
    await pool.query(`DELETE FROM menu_modifier_groups WHERE store_id = $1 AND (name->>'en') LIKE $2`, [STORE_ID, `${ITEM_TAG}%`]);
  } finally {
    await pool.end();
  }
}

async function setItemSyncSource(item_id: string, source: string): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  try {
    await pool.query(
      `UPDATE menu_items SET sync_source = $1 WHERE id = $2 AND store_id = $3`,
      [source, item_id, STORE_ID],
    );
  } finally {
    await pool.end();
  }
}

async function createItem(name: string, priceCents = 1000): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/menu/items',
    headers: { authorization: `Bearer ${jwt}` },
    payload: {
      name_i18n: { en: name },
      price_cents: priceCents,
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ id: string }>().id;
}

async function getItem(id: string) {
  const res = await app.inject({
    method: 'GET', url: `/api/menu/items/${id}`,
    headers: { authorization: `Bearer ${jwt}` },
  });
  expect(res.statusCode).toBe(200);
  return res.json<{ id: string; has_variants: boolean; has_modifiers: boolean }>();
}

beforeAll(async () => {
  process.env.DATABASE_URL = DB_URL;
  process.env.NODE_ENV = 'test';
  await purgeFixtures();

  app = await buildServer();
  await app.ready();
  jwt = await login();
}, 30_000);

afterAll(async () => {
  await purgeFixtures();
  await app.close();
});

describe('S4.5b — Variants CRUD + has_variants auto-sync', () => {
  let itemId: string;
  let variantA: string;
  let variantB: string;

  it('POST 2 variants flips menu_items.has_variants to true', async () => {
    itemId = await createItem(`${ITEM_TAG}V-Item`);
    let snap = await getItem(itemId);
    expect(snap.has_variants).toBe(false);

    const r1 = await app.inject({
      method: 'POST', url: `/api/menu/items/${itemId}/variants`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { name: { en: 'Small' }, price_delta_cents: -100, is_default: true, sort_order: 1 },
    });
    expect(r1.statusCode).toBe(201);
    variantA = r1.json<{ id: string }>().id;

    const r2 = await app.inject({
      method: 'POST', url: `/api/menu/items/${itemId}/variants`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { name: { en: 'Large' }, price_delta_cents: 200, sort_order: 2 },
    });
    expect(r2.statusCode).toBe(201);
    variantB = r2.json<{ id: string }>().id;

    snap = await getItem(itemId);
    expect(snap.has_variants).toBe(true);
  });

  it('GET /variants returns both, sorted by sort_order', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/items/${itemId}/variants`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json<Array<{ id: string; sort_order: number; is_default: boolean }>>();
    expect(list.length).toBe(2);
    expect(list[0].id).toBe(variantA);
    expect(list[0].is_default).toBe(true);
    expect(list[1].id).toBe(variantB);
  });

  it('PATCH variantB.is_default=true clears variantA.is_default', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/menu/items/${itemId}/variants/${variantB}`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { is_default: true },
    });
    expect(res.statusCode).toBe(200);

    const list = await app.inject({
      method: 'GET', url: `/api/menu/items/${itemId}/variants`,
      headers: { authorization: `Bearer ${jwt}` },
    }).then((r) => r.json<Array<{ id: string; is_default: boolean }>>());

    const a = list.find((v) => v.id === variantA)!;
    const b = list.find((v) => v.id === variantB)!;
    expect(a.is_default).toBe(false);
    expect(b.is_default).toBe(true);
  });

  it('DELETE all variants → has_variants flips back to false', async () => {
    const d1 = await app.inject({
      method: 'DELETE',
      url: `/api/menu/items/${itemId}/variants/${variantA}`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(d1.statusCode).toBe(204);

    let snap = await getItem(itemId);
    expect(snap.has_variants).toBe(true);

    const d2 = await app.inject({
      method: 'DELETE',
      url: `/api/menu/items/${itemId}/variants/${variantB}`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(d2.statusCode).toBe(204);

    snap = await getItem(itemId);
    expect(snap.has_variants).toBe(false);
  });

  it('BR-20 — variant POST on POS-locked item → 403', async () => {
    const lockedId = await createItem(`${ITEM_TAG}V-Locked`);
    await setItemSyncSource(lockedId, 'square');

    const res = await app.inject({
      method: 'POST', url: `/api/menu/items/${lockedId}/variants`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { name: { en: 'Small' } },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: string }>().error).toBe('EXTERNAL_SYNC_LOCKED');
  });
});

describe('S4.5b — Modifier Groups + nested options', () => {
  let groupId: string;

  it('POST group with 3 nested options → 201 with options array', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/modifier-groups',
      headers: { authorization: `Bearer ${jwt}` },
      payload: {
        name: { en: `${ITEM_TAG}Toppings` },
        min_select: 0,
        max_select: 3,
        is_required: false,
        options: [
          { name: { en: 'Cheese' }, price_delta_cents: 150, sort_order: 1 },
          { name: { en: 'Bacon' },  price_delta_cents: 200, sort_order: 2 },
          { name: { en: 'Olives' }, price_delta_cents: 100, sort_order: 3, is_default: true },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; options: Array<{ name: { en: string } }> }>();
    expect(body.options.length).toBe(3);
    groupId = body.id;
  });

  it('GET /:id includes options array', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/modifier-groups/${groupId}`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; options: unknown[] }>();
    expect(body.options.length).toBe(3);
  });

  it('GET list ?with_options=true includes options', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/menu/modifier-groups?with_options=true',
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json<Array<{ id: string; options: unknown[] }>>();
    const ours = list.find((g) => g.id === groupId);
    expect(ours).toBeDefined();
    expect(ours!.options.length).toBe(3);
  });

  it('POST extra option → 4 options', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/menu/modifier-groups/${groupId}/options`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { name: { en: 'Jalapenos' }, price_delta_cents: 50 },
    });
    expect(res.statusCode).toBe(201);

    const get = await app.inject({
      method: 'GET', url: `/api/menu/modifier-groups/${groupId}`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(get.json<{ options: unknown[] }>().options.length).toBe(4);
  });

  it('PATCH with is_required=true && min_select=0 (after merge) → 422', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/modifier-groups/${groupId}`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { is_required: true }, // stored min_select is 0 → conflict after merge
    });
    expect(res.statusCode).toBe(422);
    expect(res.json<{ error: string }>().error).toBe('INVALID_GROUP_CONSTRAINTS');
  });
});

describe('S4.5b — Attach/Detach + has_modifiers auto-sync', () => {
  let itemId: string;
  let groupId: string;

  it('Attach group flips menu_items.has_modifiers to true', async () => {
    itemId = await createItem(`${ITEM_TAG}M-Item`);
    const g = await app.inject({
      method: 'POST', url: '/api/menu/modifier-groups',
      headers: { authorization: `Bearer ${jwt}` },
      payload: { name: { en: `${ITEM_TAG}AttachGroup` }, min_select: 0 },
    });
    expect(g.statusCode).toBe(201);
    groupId = g.json<{ id: string }>().id;

    let snap = await getItem(itemId);
    expect(snap.has_modifiers).toBe(false);

    const att = await app.inject({
      method: 'POST',
      url: `/api/menu/items/${itemId}/attach-modifier-group/${groupId}`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { sort_order: 10 },
    });
    expect(att.statusCode).toBe(201);

    snap = await getItem(itemId);
    expect(snap.has_modifiers).toBe(true);
  });

  it('Duplicate attach → 409 MODIFIER_GROUP_ALREADY_ATTACHED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/menu/items/${itemId}/attach-modifier-group/${groupId}`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { sort_order: 10 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: string }>().error).toBe('MODIFIER_GROUP_ALREADY_ATTACHED');
  });

  it('GET attached groups returns the group with sort_order', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/items/${itemId}/modifier-groups`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json<Array<{ id: string; sort_order: number }>>();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(groupId);
    expect(list[0].sort_order).toBe(10);
  });

  it('Detach group flips has_modifiers back to false', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/menu/items/${itemId}/attach-modifier-group/${groupId}`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(204);

    const snap = await getItem(itemId);
    expect(snap.has_modifiers).toBe(false);
  });
});
