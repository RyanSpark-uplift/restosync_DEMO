// Sprint 2 S2.12 — image transcode worker unit tests
//
// transcodeImage() 는 pure function — sharp 의존만 있고 DB/R2/WS 없이 검증 가능.
// processTranscodeJob() 은 R2/DB/WS 의존성이 커서 통합 테스트 영역 (NODE_ENV=test 에서는
// BullMQ가 no-op이라 worker 인스턴스 자체가 생성되지 않음 — 별도 e2e 영역).

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { transcodeImage } from './imageTranscodeWorker';

describe('transcodeImage — pure sharp pipeline', () => {
  it('WebP output regardless of input format', async () => {
    // 100×100 red PNG fixture
    const png = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).png().toBuffer();

    const out = await transcodeImage(png);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  it('resizes oversized image to fit within 1920×1080 inside', async () => {
    // 4000×3000 — should shrink so longer side ≤ 1920
    const big = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: { r: 0, g: 128, b: 0 } },
    }).jpeg().toBuffer();

    const out = await transcodeImage(big);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(1920);
    expect(meta.height).toBeLessThanOrEqual(1080);
    // aspect ratio approximately preserved (4:3 → max width 1440 / 1080)
    expect(meta.width).toBe(1440);
    expect(meta.height).toBe(1080);
  });

  it('does NOT enlarge images smaller than max dims (withoutEnlargement)', async () => {
    const small = await sharp({
      create: { width: 320, height: 240, channels: 3, background: { r: 0, g: 0, b: 255 } },
    }).png().toBuffer();

    const out = await transcodeImage(small);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(240);
  });

  it('produces meaningfully smaller output than original JPEG for large image', async () => {
    const orig = await sharp({
      create: { width: 2400, height: 1800, channels: 3, background: { r: 200, g: 100, b: 50 } },
    }).jpeg({ quality: 95 }).toBuffer();

    const out = await transcodeImage(orig);
    // resize + WebP quality 85 should compress; flat-color synthetic is best case.
    expect(out.length).toBeLessThan(orig.length);
  });
});
