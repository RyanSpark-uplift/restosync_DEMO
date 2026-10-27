// Menu image transcode queue — Sprint 2 S2.4 (AG-022 / AM01-005)
//
// 라우트 핸들러는 raw R2 업로드 + 이 큐로 enqueue만 수행. worker (별 프로세스)가
// sharp WebP transcode → R2 processed put → DB commit → WS broadcast 순으로 처리.
//
// smsDispatcher 패턴 복제: BullMQ 5.x는 dedicated ioredis 연결을 요구하고
// (maxRetriesPerRequest: null, enableReadyCheck: false) NODE_ENV=test에서는 no-op.

import { Queue, type JobsOptions } from 'bullmq';
import Redis from 'ioredis';

export interface TranscodeJobPayload {
  store_id:     string;
  item_id:      string;          // menu_items.id — worker가 UPDATE 대상으로 사용
  raw_key:      string;          // R2 raw object key (rawKey())
  mime:         string;          // 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  original_size: number;         // 모니터링용 (transcode 전후 비교)
  user_id?:     string;          // 요청자 — audit_log actor
}

// BullMQ 5.x: queue name에 ':' 사용 금지.
const QUEUE_NAME = 'menu-transcode';

const isTestEnv = process.env.NODE_ENV === 'test';

// dedicated connection (db/redis.ts와 충돌 방지)
const connection = isTestEnv
  ? null
  : new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

let queue: Queue<TranscodeJobPayload> | null = null;

export function getTranscodeQueue(): Queue<TranscodeJobPayload> | null {
  if (isTestEnv) return null;
  if (!queue && connection) {
    queue = new Queue<TranscodeJobPayload>(QUEUE_NAME, { connection });
  }
  return queue;
}

export { QUEUE_NAME as TRANSCODE_QUEUE_NAME };

export function getTranscodeConnection(): Redis | null {
  return connection;
}

const DEFAULT_JOB_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

// Enqueue. raw R2 업로드는 호출자(route)가 미리 완료. 여기서는 job 등록만.
// 반환: { id } — DB에 photo_job_id 로 저장하고 클라이언트에는 job_id 로 응답.
export async function enqueueTranscode(
  payload: TranscodeJobPayload,
): Promise<{ id: string } | null> {
  const q = getTranscodeQueue();
  if (!q) return null;                       // test env / no Redis → drop
  const job = await q.add('menu-photo', payload, DEFAULT_JOB_OPTS);
  return { id: String(job.id) };
}

// 폴링 (GET /api/menu/upload/jobs/:id)
export async function getTranscodeJob(id: string): Promise<{
  id:            string;
  status:        'queued' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown';
  progress:      number;
  attempts:      number;
  failed_reason: string | null;
  store_id:      string | null;
  item_id:       string | null;
} | null> {
  const q = getTranscodeQueue();
  if (!q) return null;
  const job = await q.getJob(id);
  if (!job) return null;
  const state = await job.getState();
  // BullMQ state -> our state. 'waiting' / 'prioritized' → 'queued'.
  const status =
    state === 'completed' ? 'completed'
    : state === 'failed'  ? 'failed'
    : state === 'active'  ? 'active'
    : state === 'delayed' ? 'delayed'
    : state === 'waiting' || state === 'waiting-children' || state === 'prioritized' ? 'queued'
    : 'unknown';
  return {
    id:            String(job.id),
    status,
    progress:      typeof job.progress === 'number' ? job.progress : 0,
    attempts:      job.attemptsMade,
    failed_reason: job.failedReason ?? null,
    store_id:      job.data?.store_id ?? null,
    item_id:       job.data?.item_id ?? null,
  };
}

// Graceful shutdown (server.ts SIGTERM hook + tests)
export async function __shutdown(): Promise<void> {
  await queue?.close();
  connection?.disconnect();
  queue = null;
}
