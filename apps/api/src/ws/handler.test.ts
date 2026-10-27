import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

describe('WS /ws endpoint', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /ws without WS upgrade → non-2xx (requires WebSocket upgrade)', async () => {
    // @fastify/websocket: HTTP-only inject → 404 (라우트는 존재하나 upgrade 없으면 not found)
    const res = await app.inject({ method: 'GET', url: '/ws' });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
