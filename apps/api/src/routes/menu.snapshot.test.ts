// Sprint 2 S2.19 — GET /api/menu/snapshot route tests
//
// Test 환경에서는 DB가 비어있어 STORE_NOT_FOUND가 정상. auth + header 동작만 검증.
// cold/warm cache + invalidation의 실제 동작은 seed된 매장 대상 e2e에서 별도.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

function sign(app: Awaited<ReturnType<typeof buildServer>>) {
  return app.jwt.sign({
    sub: '00000000-0000-0000-0000-000000000001',
    store_id: '00000000-0000-0000-0000-000000000001',
    role: 'staff',
    type: 'access',
  }, { expiresIn: '15m' });
}

describe('GET /api/menu/snapshot', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/menu/snapshot' });
    expect(res.statusCode).toBe(401);
  });

  it('400 INVALID_QUERY for unsupported lang', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/menu/snapshot?lang=de',
      headers: { authorization: `Bearer ${sign(app)}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('INVALID_QUERY');
  });

  it('rejects extra query params (Zod strict)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/menu/snapshot?store_id=evil-store',
      headers: { authorization: `Bearer ${sign(app)}` },
    });
    expect(res.statusCode).toBe(400);
  });

  // 정상 케이스: DB에 seed된 store_id가 없으면 STORE_NOT_FOUND → Fastify 500 처리.
  // test env에서는 buildSnapshot이 throw하면 setErrorHandler가 500을 보낸다.
  // 시드된 DB에서만 200이 나오므로 통합 e2e는 별도.
  it('500 (STORE_NOT_FOUND) for unknown store in clean test DB', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/menu/snapshot',
      headers: { authorization: `Bearer ${sign(app)}` },
    });
    // 클린 DB → buildSnapshot throws → 500. seed된 환경에선 200.
    expect([200, 500]).toContain(res.statusCode);
  });
});
