// R2 / S3 통합 client — Sprint 2 S2.3 (AG-022 BullMQ worker 분리용)
//
// Cloudflare R2를 우선 사용하고, R2 환경변수가 없으면 기존 AWS S3 설정으로 자동 fallback.
// R2는 region='auto' + custom endpoint + 동일한 S3 API라서 SDK 분기 불필요.
//
// AG-001: store_id를 key path에 항상 포함해서 cross-store 객체 접근 사고 차단.
// AG-017: @aws-sdk/client-s3는 이미 TOOL-REVIEW.md 등재.

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

// ── client factory (lazy) ─────────────────────────────────────────────────────
let _client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (_client) return _client;
  const r2Endpoint = process.env.R2_ENDPOINT;
  if (r2Endpoint) {
    _client = new S3Client({
      region: 'auto',
      endpoint: r2Endpoint,
      credentials: {
        accessKeyId:     process.env.R2_ACCESS_KEY_ID     ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  } else {
    _client = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return _client;
}

function getBucket(): string {
  const b = process.env.R2_BUCKET ?? process.env.S3_BUCKET;
  if (!b) throw new Error('R2_BUCKET / S3_BUCKET not set');
  return b;
}

function getPublicBase(): string {
  const base = process.env.R2_PUBLIC_URL ?? process.env.CDN_BASE_URL;
  if (!base) throw new Error('R2_PUBLIC_URL / CDN_BASE_URL not set');
  return base.replace(/\/$/, '');
}

// ── key builders ──────────────────────────────────────────────────────────────
// 모든 key는 store_id prefix — AG-001 cross-store 접근 차단.
export function rawKey(storeId: string, ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
  return `raw/${storeId}/${randomUUID()}.${safeExt}`;
}

export function processedKey(storeId: string, itemId: string): string {
  // hash 없이 itemId 기반 — 같은 item 새 사진은 덮어쓰기. CDN은 ETag로 캐시 invalidate.
  return `menu/${storeId}/${itemId}.webp`;
}

// ── put helpers ───────────────────────────────────────────────────────────────
export async function putRawObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<{ key: string; url: string }> {
  await getS3Client().send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
    // raw는 24h TTL (BR-27) — bucket lifecycle rule이 처리. SDK 레벨에서는 메타만 표시.
    Metadata: { lifecycle: 'raw-24h' },
  }));
  return { key, url: `${getPublicBase()}/${key}` };
}

export async function putProcessedObject(
  key: string,
  body: Buffer,
): Promise<{ key: string; url: string }> {
  await getS3Client().send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000',
  }));
  return { key, url: `${getPublicBase()}/${key}` };
}

// ── get helper (worker용) ─────────────────────────────────────────────────────
export async function getRawObject(key: string): Promise<Buffer> {
  const res = await getS3Client().send(new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  }));
  const stream = res.Body as Readable | undefined;
  if (!stream) throw new Error(`R2 object empty: ${key}`);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ── env probe (worker startup이 R2 미설정 시 경고용) ─────────────────────────
export function isR2Configured(): boolean {
  return Boolean(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
}

export function isAnyStorageConfigured(): boolean {
  return Boolean(
    (process.env.R2_BUCKET ?? process.env.S3_BUCKET) &&
    (process.env.R2_PUBLIC_URL ?? process.env.CDN_BASE_URL),
  );
}
