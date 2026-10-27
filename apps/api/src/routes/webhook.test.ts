import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

describe('Webhook routes — validation', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // HMAC secret 미설정(test 환경) → HMAC skip, store param 검증
  it('POST /webhook/grubhub without store param → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/grubhub',
      payload: { order_id: 'gh-001', items: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /webhook/doordash without store param → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/doordash',
      payload: { order_id: 'dd-001', items: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /webhook/ubereats without store param → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/ubereats',
      payload: { order_id: 'ue-001', items: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /webhook/grubhub with unknown store slug → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/grubhub?store=nonexistent-store',
      payload: { order_id: 'gh-002', items: [] },
    });
    expect(res.statusCode).toBe(404);
  });
});
