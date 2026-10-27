import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../server';
import { generateQrToken } from './qr';

describe('QR public route', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  const prevSecret = process.env.QR_HMAC_SECRET;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => { delete process.env.QR_HMAC_SECRET; });
  afterEach(()  => { if (prevSecret) process.env.QR_HMAC_SECRET = prevSecret; });

  it('GET /qr/o/:token returns 503 when secret not configured', async () => {
    const res = await app.inject({ method: 'GET', url: '/qr/o/fake.token' });
    expect(res.statusCode).toBe(503);
  });

  it('GET /qr/o/:token returns 404 on invalid signature', async () => {
    process.env.QR_HMAC_SECRET = 'test-secret-key-1234';
    const res = await app.inject({ method: 'GET', url: '/qr/o/aGVsbG8.invalidsig' });
    expect(res.statusCode).toBe(404);
  });

  it('generateQrToken returns null when secret missing', () => {
    expect(generateQrToken('order-id', 'store-id')).toBeNull();
  });

  it('generateQrToken produces verifiable token', () => {
    process.env.QR_HMAC_SECRET = 'test-secret-key-1234';
    const token = generateQrToken('order-id', 'store-id', 300);
    expect(token).toBeTruthy();
    expect(token!.includes('.')).toBe(true);
    // Token has two base64url segments.
    const [body, sig] = token!.split('.');
    expect(body.length).toBeGreaterThan(0);
    expect(sig.length).toBeGreaterThan(0);
  });
});
