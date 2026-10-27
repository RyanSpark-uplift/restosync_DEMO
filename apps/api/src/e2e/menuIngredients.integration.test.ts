// Sprint 4 S4.6 — live-DB integration tests for ingredients + recipe + stock-adjust
// Mirrors menuModifiers.integration.test.ts. Requires `docker compose up` (PG + Redis).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { buildServer } from '../server';
import type { FastifyInstance } from 'fastify';

const DB_URL    = process.env.DATABASE_URL ?? 'postgresql://rs_user:rs_pass@localhost:5432/restosync';
const STORE_ID  = '97313de4-f52c-4381-91dd-cbc491b58943';
const NAME_TAG  = 'S4.6-INT-';

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
    method: 'POST', url: '/api/auth/login',
    payload: { store_id: STORE_ID, user_id: userId, pin: '1234' },
  });
  if (res.statusCode !== 200) throw new Error(`Login failed ${res.statusCode}: ${res.body}`);
  return res.json<{ access_token: string }>().access_token;
}

async function purgeFixtures(): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  try {
    // Drop recipe lines first (ON DELETE RESTRICT on ingredient).
    await pool.query(
      `DELETE FROM menu_item_ingredients WHERE store_id = $1 AND item_id IN
       (SELECT id FROM menu_items WHERE store_id = $1 AND (name_i18n->>'en') LIKE $2)`,
      [STORE_ID, `${NAME_TAG}%`],
    );
    await pool.query(
      `DELETE FROM menu_items WHERE store_id = $1 AND (name_i18n->>'en') LIKE $2`,
      [STORE_ID, `${NAME_TAG}%`],
    );
    await pool.query(
      `DELETE FROM menu_ingredients WHERE store_id = $1 AND (name->>'en') LIKE $2`,
      [STORE_ID, `${NAME_TAG}%`],
    );
  } finally {
    await pool.end();
  }
}

async function createItem(name: string): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/menu/items',
    headers: { authorization: `Bearer ${jwt}` },
    payload: { name_i18n: { en: name }, price_cents: 1000 },
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ id: string }>().id;
}

async function createIngredient(name: string, unit = 'kg', extra: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: 'POST', url: '/api/menu/ingredients',
    headers: { authorization: `Bearer ${jwt}` },
    payload: { name: { en: name }, unit, ...extra },
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ id: string; stock_quantity: string; unit: string }>();
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

describe('S4.6 — Ingredients CRUD + low_stock filter', () => {
  let AppleId: string;
  let cheeseId: string;

  it('POST 2 ingredients', async () => {
    const Apple = await createIngredient(`${NAME_TAG}Apple`, 'kg', {
      stock_quantity: '20.500', min_threshold: '5.000',
    });
    const cheese = await createIngredient(`${NAME_TAG}Cheese`, 'g', {
      stock_quantity: '1.500', min_threshold: '500.000',  // < threshold → low_stock
    });
    AppleId = Apple.id;
    cheeseId = cheese.id;
    expect(Apple.unit).toBe('kg');
    expect(cheese.unit).toBe('g');
  });

  it('GET /ingredients lists store ingredients', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/ingredients?search=${NAME_TAG}`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json<Array<{ id: string }>>();
    expect(list.map((r) => r.id).sort()).toEqual([AppleId, cheeseId].sort());
  });

  it('GET /ingredients?low_stock=true filters cheese only', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/ingredients?low_stock=true&search=${NAME_TAG}`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json<Array<{ id: string }>>();
    expect(list.map((r) => r.id)).toEqual([cheeseId]);
  });

  it('PATCH ingredient name → 200', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/ingredients/${AppleId}`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { name: { en: `${NAME_TAG}AppleX`, ko: '토마토' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ name: Record<string, string> }>().name).toEqual({
      en: `${NAME_TAG}AppleX`, ko: '토마토',
    });
  });

  it('GET /ingredients/:id returns single row', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/ingredients/${AppleId}`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }>().id).toBe(AppleId);
  });
});

describe('S4.6 — Stock adjust (delta/set + kitchen RBAC)', () => {
  let saltId: string;

  it('POST ingredient for stock tests', async () => {
    const r = await createIngredient(`${NAME_TAG}Salt`, 'kg', { stock_quantity: '10.000' });
    saltId = r.id;
  });

  it('stock-adjust delta -3.000 → 7.000', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/ingredients/${saltId}/stock-adjust`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { mode: 'delta', delta: -3, reason: 'used for soup' },
    });
    expect(res.statusCode).toBe(200);
    expect(Number(res.json<{ stock_quantity: string }>().stock_quantity)).toBeCloseTo(7, 3);
  });

  it('stock-adjust set 5.250 → 5.250', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/ingredients/${saltId}/stock-adjust`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { mode: 'set', value: '5.250' },
    });
    expect(res.statusCode).toBe(200);
    expect(Number(res.json<{ stock_quantity: string }>().stock_quantity)).toBeCloseTo(5.25, 3);
  });

  it('stock-adjust delta below zero → 422 NEGATIVE_STOCK_REJECTED', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/menu/ingredients/${saltId}/stock-adjust`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { mode: 'delta', delta: -1000 },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json<{ error: string }>().error).toBe('NEGATIVE_STOCK_REJECTED');
  });
});

describe('S4.6 — Recipe PUT (entire replacement)', () => {
  let itemId: string;
  let flourId: string;
  let eggId: string;

  it('Setup item + ingredients', async () => {
    itemId = await createItem(`${NAME_TAG}Pancake`);
    flourId = (await createIngredient(`${NAME_TAG}Flour`, 'g')).id;
    eggId = (await createIngredient(`${NAME_TAG}Egg`, 'each')).id;
  });

  it('GET recipe — empty initially', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/items/${itemId}/ingredients`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<unknown[]>().length).toBe(0);
  });

  it('PUT recipe with 2 lines → 200', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/menu/items/${itemId}/recipe`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: {
        lines: [
          { ingredient_id: flourId, quantity: 150, unit: 'g', sort_order: 1 },
          { ingredient_id: eggId, quantity: 2, unit: 'each', sort_order: 2 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ lines: unknown[] }>().lines.length).toBe(2);
  });

  it('GET recipe — joined ingredient_name returned', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/menu/items/${itemId}/ingredients`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json<Array<{ ingredient_name: Record<string, string>; quantity: string }>>();
    expect(rows.length).toBe(2);
    expect(rows[0].ingredient_name.en).toBe(`${NAME_TAG}Flour`);
    expect(Number(rows[0].quantity)).toBeCloseTo(150, 3);
  });

  it('PUT recipe with empty array → 200, recipe cleared', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/menu/items/${itemId}/recipe`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { lines: [] },
    });
    expect(res.statusCode).toBe(200);

    const get = await app.inject({
      method: 'GET', url: `/api/menu/items/${itemId}/ingredients`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(get.json<unknown[]>().length).toBe(0);
  });

  it('PUT recipe referencing unknown ingredient → 422', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/menu/items/${itemId}/recipe`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: {
        lines: [
          { ingredient_id: '00000000-0000-0000-0000-deaddeaddead', quantity: 1, unit: 'g' },
        ],
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json<{ error: string }>().error).toBe('INGREDIENT_NOT_FOUND');
  });

  it('PUT recipe on POS-mastered item → 403 EXTERNAL_SYNC_LOCKED', async () => {
    await setItemSyncSource(itemId, 'toast');
    const res = await app.inject({
      method: 'PUT', url: `/api/menu/items/${itemId}/recipe`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { lines: [{ ingredient_id: flourId, quantity: 1, unit: 'g' }] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: string }>().error).toBe('EXTERNAL_SYNC_LOCKED');
    // restore for cleanup
    await setItemSyncSource(itemId, 'restosync');
  });

  it('DELETE ingredient referenced by recipe → 409 INGREDIENT_IN_USE', async () => {
    // Re-attach flour to set up the conflict.
    await app.inject({
      method: 'PUT', url: `/api/menu/items/${itemId}/recipe`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { lines: [{ ingredient_id: flourId, quantity: 100, unit: 'g' }] },
    });

    const res = await app.inject({
      method: 'DELETE', url: `/api/menu/ingredients/${flourId}`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: string; recipe_count: number }>()).toMatchObject({
      error: 'INGREDIENT_IN_USE', recipe_count: 1,
    });
  });

  it('Clear recipe → DELETE ingredient succeeds → 204', async () => {
    await app.inject({
      method: 'PUT', url: `/api/menu/items/${itemId}/recipe`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: { lines: [] },
    });

    const res = await app.inject({
      method: 'DELETE', url: `/api/menu/ingredients/${flourId}`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(res.statusCode).toBe(204);
  });
});
