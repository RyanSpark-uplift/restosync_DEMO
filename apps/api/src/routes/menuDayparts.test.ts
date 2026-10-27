// Sprint 1 S1.15 — menuDayparts routes vitest
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

const FAKE_STORE = '00000000-0000-0000-0000-000000000001';
const FAKE_USER  = '00000000-0000-0000-0000-000000000001';

describe('Menu Dayparts — auth + overlap validation', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeAll(async () => { app = await buildServer(); await app.ready(); });
  afterAll(async () => { await app.close(); });

  it('GET /api/menu/dayparts without auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/menu/dayparts' });
    expect(res.statusCode).toBe(401);
  });

  it('PUT without owner/manager role → 403', async () => {
    const jwt = app.jwt.sign({ sub: FAKE_USER, store_id: FAKE_STORE, role: 'staff', type: 'access' }, { expiresIn: '15m' });
    const res = await app.inject({
      method: 'PUT', url: '/api/menu/dayparts',
      headers: { authorization: `Bearer ${jwt}` },
      payload: { windows: { breakfast: { start: '06:00', end: '11:00' } } },
    });
    expect(res.statusCode).toBe(403);
  });

  it('PUT with overlapping windows → 422', async () => {
    const jwt = app.jwt.sign({ sub: FAKE_USER, store_id: FAKE_STORE, role: 'owner', type: 'access' }, { expiresIn: '15m' });
    const res = await app.inject({
      method: 'PUT', url: '/api/menu/dayparts',
      headers: { authorization: `Bearer ${jwt}` },
      payload: {
        windows: {
          breakfast: { start: '06:00', end: '11:00' },
          lunch:     { start: '10:00', end: '14:00' },  // ← overlaps breakfast
        },
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it('PUT with invalid daypart enum value (closed) → 422', async () => {
    const jwt = app.jwt.sign({ sub: FAKE_USER, store_id: FAKE_STORE, role: 'owner', type: 'access' }, { expiresIn: '15m' });
    const res = await app.inject({
      method: 'PUT', url: '/api/menu/dayparts',
      headers: { authorization: `Bearer ${jwt}` },
      payload: {
        windows: {
          closed: { start: '02:00', end: '06:00' },  // ← 'closed' not in DAYPART enum
        },
      },
    });
    expect(res.statusCode).toBe(422);
  });
});
