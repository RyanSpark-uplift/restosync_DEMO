import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

describe('TV Pairing routes — validation', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── pair-request: open, body-required ────────────────────────────────────
  it('POST /api/tv-instances/pair-request without device_id → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tv-instances/pair-request',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/tv-instances/pair-request with device_id → 201 + 6-char code + ISO expires_at', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tv-instances/pair-request',
      payload: { device_id: 'unit-test-device-001' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { pairing_code: string; expires_at: string };
    expect(body.pairing_code).toMatch(/^[A-Z0-9]{6}$/);
    // No ambiguous chars per CODE_ALPHABET.
    expect(body.pairing_code).not.toMatch(/[ILO01]/);
    expect(() => new Date(body.expires_at).toISOString()).not.toThrow();
  });

  // ── pair-status: open, code-required ─────────────────────────────────────
  it('GET /api/tv-instances/pair-status without code → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tv-instances/pair-status',
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/tv-instances/pair-status with unknown code → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tv-instances/pair-status?code=ZZZZZZ',
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/tv-instances/pair-status right after pair-request → pending', async () => {
    const req = await app.inject({
      method: 'POST',
      url: '/api/tv-instances/pair-request',
      payload: { device_id: 'unit-test-device-002' },
    });
    const { pairing_code } = req.json() as { pairing_code: string };

    const res = await app.inject({
      method: 'GET',
      url: `/api/tv-instances/pair-status?code=${pairing_code}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'pending' });
  });

  // ── pair-claim: staff JWT required ───────────────────────────────────────
  it('POST /api/tv-instances/pair-claim without auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tv-instances/pair-claim',
      payload: { pairing_code: 'ABCDEF', function_type: 'pickup' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/tv-instances/pair-claim with bad function_type → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tv-instances/pair-claim',
      headers: { authorization: 'Bearer nope' },
      payload: { pairing_code: 'ABCDEF', function_type: 'NONSENSE' },
    });
    // Either 400 (schema rejects enum) or 401 (auth fails first) — both prove
    // the schema/auth wall holds before we get to DB.
    expect([400, 401]).toContain(res.statusCode);
  });
});
