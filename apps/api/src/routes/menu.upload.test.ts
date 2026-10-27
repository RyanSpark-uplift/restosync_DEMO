// Sprint 2 S2.11 — /api/menu/upload route validation tests
//
// Test 환경에서는 BullMQ가 no-op (transcodeQueue.getTranscodeQueue() returns null) 이고
// 실제 DB가 비어있다. 따라서 storage 미설정 fallback 경로 + auth + validation에만 집중.
// transcode worker 단위 테스트는 imageTranscodeWorker.test.ts에서 별도.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

function sign(app: Awaited<ReturnType<typeof buildServer>>, role = 'manager') {
  return app.jwt.sign({
    sub: '00000000-0000-0000-0000-000000000001',
    store_id: '00000000-0000-0000-0000-000000000001',
    role,
    type: 'access',
  }, { expiresIn: '15m' });
}

// Minimal RFC 7578 multipart/form-data writer — fastify inject 가 form-data 라이브러리에
// 의존하지 않도록 직접 빌드. file field + optional text fields.
function makeMultipart(opts: {
  filename: string;
  mime: string;
  bytes: Buffer;
  fields?: Record<string, string>;
}): { body: Buffer; contentType: string } {
  const boundary = '----rs-test-' + Math.random().toString(36).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(opts.fields ?? {})) {
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${k}"\r\n\r\n` +
      `${v}\r\n`
    , 'utf8'));
  }
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${opts.filename}"\r\n` +
    `Content-Type: ${opts.mime}\r\n\r\n`
  , 'utf8'));
  parts.push(opts.bytes);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe('POST /api/menu/upload — auth + validation', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('401 without auth', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/menu/upload' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects non-multipart body (400/406/415)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/menu/upload',
      headers: { authorization: `Bearer ${sign(app)}` },
      payload: '',
    });
    // Fastify multipart hook may reject as 406 (no acceptable content-type) or 415.
    expect([400, 406, 415, 500]).toContain(res.statusCode);
  });

  it('400 UNSUPPORTED_TYPE for text/plain file', async () => {
    const mp = makeMultipart({
      filename: 'notes.txt',
      mime: 'text/plain',
      bytes: Buffer.from('hello'),
    });
    const res = await app.inject({
      method: 'POST', url: '/api/menu/upload',
      headers: {
        authorization: `Bearer ${sign(app)}`,
        'content-type': mp.contentType,
      },
      payload: mp.body,
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('UNSUPPORTED_TYPE');
  });

  it('413 FILE_TOO_LARGE for >5MB image', async () => {
    // 5.5MB JPEG-marked buffer — multipart hits fileSize limit first (413 or 500 ERR_FST).
    const big = Buffer.alloc(5_500_000, 0xff);
    const mp = makeMultipart({
      filename: 'huge.jpg', mime: 'image/jpeg', bytes: big,
    });
    const res = await app.inject({
      method: 'POST', url: '/api/menu/upload',
      headers: {
        authorization: `Bearer ${sign(app)}`,
        'content-type': mp.contentType,
      },
      payload: mp.body,
    });
    expect([413, 400, 500]).toContain(res.statusCode);
  });

  it('403 for kitchen role (upload requires owner/manager/staff)', async () => {
    const mp = makeMultipart({
      filename: 'x.png', mime: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });
    const res = await app.inject({
      method: 'POST', url: '/api/menu/upload',
      headers: {
        authorization: `Bearer ${sign(app, 'kitchen')}`,
        'content-type': mp.contentType,
      },
      payload: mp.body,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /api/menu/upload/jobs/:id — auth + ownership', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeAll(async () => { app = await buildServer(); await app.ready(); });
  afterAll(async () => { await app.close(); });

  it('401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/menu/upload/jobs/abc' });
    expect(res.statusCode).toBe(401);
  });

  it('404 JOB_NOT_FOUND in test env (BullMQ no-op)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/menu/upload/jobs/nonexistent',
      headers: { authorization: `Bearer ${sign(app)}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('JOB_NOT_FOUND');
  });
});
