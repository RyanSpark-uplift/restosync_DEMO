import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });

// ── Drop-shadow compositor ────────────────────────────────────────────────────
// Input: RGBA PNG from remove.bg. Output: WebP on expanded canvas with shadow.
async function withDropShadow(inputPng: Buffer): Promise<Buffer> {
  const { width = 800, height = 600 } = await sharp(inputPng).metadata();
  const pad = 20;
  const offsetY = 6;
  const shadowBlur = 10;

  // Extract alpha channel as 1-channel raw buffer
  const { data: alphaData } = await sharp(inputPng)
    .ensureAlpha()
    .extractChannel('alpha')
    .raw()
    .toBuffer({ resolveWithObject: true });

  // RGBA black layer masked to image silhouette, then blurred
  const shadow = await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 200 } },
  })
    .composite([{
      input: alphaData,
      raw: { width, height, channels: 1 },
      blend: 'dest-in',
    }])
    .blur(shadowBlur)
    .png()
    .toBuffer();

  // Compose onto transparent canvas: shadow (offset) below original
  return sharp({
    create: {
      width: width + pad * 2,
      height: height + pad * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: shadow,    top: pad + offsetY, left: pad },
      { input: inputPng,  top: pad,           left: pad },
    ])
    .webp({ quality: 88 })
    .toBuffer();
}

// ── S3 upload helper ──────────────────────────────────────────────────────────
async function uploadToS3(
  body: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  const bucket = process.env.S3_BUCKET;
  const cdnBase = process.env.CDN_BASE_URL?.replace(/\/$/, '');
  if (!bucket || !cdnBase) throw new Error('S3_BUCKET / CDN_BASE_URL not set');

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000',
  }));

  return `${cdnBase}/${key}`;
}

// ── Public API ────────────────────────────────────────────────────────────────
// Returns CDN URL. Falls back to original upload if remove.bg / sharp fails.
export async function processMenuPhoto(
  file: Buffer,
  mimeType = 'image/jpeg',
): Promise<string> {
  const id = randomUUID();
  const apiKey = process.env.REMOVEBG_API_KEY;

  if (apiKey) {
    try {
      const form = new FormData();
      // Buffer → Uint8Array → Blob: @types/node 22+ marks Buffer's backing as ArrayBufferLike (incl. SharedArrayBuffer),
      // while Blob requires ArrayBuffer-backed view. Uint8Array.from copies into a fresh ArrayBuffer.
      form.append('image_file', new Blob([Uint8Array.from(file)], { type: mimeType }), 'image');
      form.append('size', 'auto');

      const res = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey },
        body: form,
      });

      if (!res.ok) throw new Error(`remove.bg ${res.status}: ${await res.text()}`);

      const noBgPng = Buffer.from(await res.arrayBuffer());
      const processed = await withDropShadow(noBgPng);

      return uploadToS3(processed, `menu/${id}.webp`, 'image/webp');
    } catch (err) {
      console.error('[imageService] processMenuPhoto fallback:', err);
    }
  }

  // Fallback: upload original as-is
  const ext = mimeType.split('/')[1] ?? 'jpg';
  return uploadToS3(file, `menu/${id}_orig.${ext}`, mimeType);
}
