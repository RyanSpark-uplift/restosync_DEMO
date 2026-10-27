// Image transcode worker — Sprint 2 S2.6 (AG-022 / AM01-005)
//
// 별 프로세스에서 실행. BullMQ Job 받으면:
//  1. R2 raw GET
//  2. sharp resize(1920×1080 inside) + WebP quality 85
//  3. R2 processed PUT (menu/{store_id}/{item_id}.webp)
//  4. DB transaction commit (image_url + photo_status='ready' + photo_transcoded_at + photo_size_bytes)
//     - AG-001 store_id WHERE + AM01-010 isNull(deleted_at) race guard
//  5. audit_log insert (commit 후)
//  6. WS broadcast display:menu_item_updated (AG-023 commit 후만)
//
// 실패 시: photo_status='failed' UPDATE + audit + broadcast skip. BullMQ retry 3회 후 DLQ.

import { Worker, type Job } from 'bullmq';
import sharp from 'sharp';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/db';
import { menu_items } from '../db/schema';
import { broadcast } from '../ws/broadcast';
import { logAudit } from '../services/audit';
import { invalidateSnapshot } from '../services/menuSnapshot';
import { getRawObject, putProcessedObject, processedKey } from '../lib/r2Client';
import {
  TRANSCODE_QUEUE_NAME,
  getTranscodeConnection,
  type TranscodeJobPayload,
} from '../services/transcodeQueue';

// BR-04: 1920×1080 max (fit:inside) + WebP quality 85.
// quality 85가 80과 시각적 차이 거의 없으면서 size ~15% 작음 (Sprint 2 후 실측).
const TRANSCODE_OPTS = {
  maxWidth:  1920,
  maxHeight: 1080,
  quality:   85,
} as const;

export async function transcodeImage(raw: Buffer): Promise<Buffer> {
  return sharp(raw)
    .rotate()                            // EXIF 회전 정규화
    .resize(TRANSCODE_OPTS.maxWidth, TRANSCODE_OPTS.maxHeight, {
      fit:                'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: TRANSCODE_OPTS.quality })
    .toBuffer();
}

export async function processTranscodeJob(job: Job<TranscodeJobPayload>): Promise<{
  image_url:        string;
  photo_size_bytes: number;
}> {
  const { store_id, item_id, raw_key, user_id, original_size } = job.data;

  // 0. 처리 시작 마킹 (pending → processing). race guard + 매장 격리.
  await db.update(menu_items)
    .set({ photo_status: 'processing', updated_at: new Date() })
    .where(and(
      eq(menu_items.store_id, store_id),
      eq(menu_items.id, item_id),
      isNull(menu_items.deleted_at),
    ));

  // 1. R2 raw GET
  const rawBuf = await getRawObject(raw_key);

  // 2. sharp transcode
  const webp = await transcodeImage(rawBuf);

  // 3. R2 processed PUT
  const out = await putProcessedObject(processedKey(store_id, item_id), webp);

  // 4. DB commit — single UPDATE (transaction 불필요: 1 row, 1 audit insert).
  //    AM01-010 — isNull(deleted_at) WHERE 유지.
  const now = new Date();
  const [updated] = await db.update(menu_items)
    .set({
      image_url:           out.url,
      photo_status:        'ready',
      photo_transcoded_at: now,
      photo_size_bytes:    webp.length,
      updated_at:          now,
    })
    .where(and(
      eq(menu_items.store_id, store_id),
      eq(menu_items.id, item_id),
      isNull(menu_items.deleted_at),
    ))
    .returning();

  if (!updated) {
    // item이 사라짐 (race / soft-delete). 객체는 raw 24h TTL로 자동 청소.
    throw new Error(`ITEM_VANISHED store=${store_id} item=${item_id}`);
  }

  // 5. audit (AG-023: commit 후)
  await logAudit({
    store_id,
    entity_type: 'menu_item',
    entity_id:   item_id,
    operation:   'update',
    user_id,
    reason:      'photo_transcode_complete',
    before: { photo_status: 'processing', image_url: null },
    after:  { photo_status: 'ready', image_url: out.url, photo_size_bytes: webp.length, original_size },
  });

  // 6. AM01-013: audit → invalidate → broadcast
  await invalidateSnapshot(store_id);

  // 7. broadcast — TV menu role만
  broadcast(store_id, 'display:menu_item_updated', { item: updated },
    (c) => c.device_type === 'tv' && c.role === 'menu');

  return { image_url: out.url, photo_size_bytes: webp.length };
}

async function handleFailure(job: Job<TranscodeJobPayload>, err: Error): Promise<void> {
  const { store_id, item_id, user_id } = job.data;
  // 마지막 시도가 실패한 경우에만 photo_status='failed'. 중간 retry는 'processing' 유지.
  if (job.attemptsMade + 1 < (job.opts.attempts ?? 3)) return;
  try {
    await db.update(menu_items)
      .set({ photo_status: 'failed', updated_at: new Date() })
      .where(and(
        eq(menu_items.store_id, store_id),
        eq(menu_items.id, item_id),
        isNull(menu_items.deleted_at),
      ));
    await logAudit({
      store_id,
      entity_type: 'menu_item',
      entity_id:   item_id,
      operation:   'update',
      user_id,
      reason:      'photo_transcode_failed',
      after:       { photo_status: 'failed', error: err.message.slice(0, 200) },
    });
  } catch {
    // DB 동시 장애 — 다음 health check가 잡음
  }
}

let _worker: Worker<TranscodeJobPayload> | null = null;

export function startTranscodeWorker(): Worker<TranscodeJobPayload> | null {
  if (process.env.NODE_ENV === 'test') return null;
  if (_worker) return _worker;
  const connection = getTranscodeConnection();
  if (!connection) return null;

  _worker = new Worker<TranscodeJobPayload>(
    TRANSCODE_QUEUE_NAME,
    processTranscodeJob,
    { connection, concurrency: 2 },     // CPU 보호 — sharp는 단일 코어 사용 ~8s/5MB
  );

  _worker.on('completed', (job, result) => {
    // eslint-disable-next-line no-console
    console.log(`[transcode] ✓ job=${job.id} store=${job.data.store_id} item=${job.data.item_id} size=${result.photo_size_bytes}b`);
  });
  _worker.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.warn(`[transcode] ✗ job=${job?.id} attempt=${job?.attemptsMade}/${job?.opts.attempts} err=${err.message}`);
    if (job) void handleFailure(job, err);
  });

  return _worker;
}

export async function __stopTranscodeWorker(): Promise<void> {
  await _worker?.close();
  _worker = null;
}
