// Menu Import queue — Sprint 5A (PRD §3.5 / §5.3, AG-022)
//
// Route handler enqueues only; dedicated worker (apps/api/src/workers/importWorker.ts)
// parses the xlsx, validates rows, writes errors/preview into menu_import_jobs, and
// transitions status pending → validating → preview_ready (or failed).
// transcodeQueue.ts 패턴 그대로 — NODE_ENV=test no-op.

import { Queue, type JobsOptions } from 'bullmq';
import Redis from 'ioredis';

export interface ImportJobPayload {
  job_id:   string;          // menu_import_jobs.id
  store_id: string;
  raw_path: string;          // local fs path (P1)
}

const QUEUE_NAME = 'menu-import';

const isTestEnv = process.env.NODE_ENV === 'test';

const connection = isTestEnv
  ? null
  : new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

let queue: Queue<ImportJobPayload> | null = null;

export function getImportQueue(): Queue<ImportJobPayload> | null {
  if (isTestEnv) return null;
  if (!queue && connection) {
    queue = new Queue<ImportJobPayload>(QUEUE_NAME, { connection });
  }
  return queue;
}

export { QUEUE_NAME as IMPORT_QUEUE_NAME };

export function getImportConnection(): Redis | null {
  return connection;
}

const DEFAULT_JOB_OPTS: JobsOptions = {
  attempts: 2,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export async function enqueueImportJob(payload: ImportJobPayload): Promise<{ id: string } | null> {
  const q = getImportQueue();
  if (!q) return null;
  const job = await q.add('menu-import', payload, DEFAULT_JOB_OPTS);
  return { id: String(job.id) };
}

export async function __shutdown(): Promise<void> {
  await queue?.close();
  connection?.disconnect();
  queue = null;
}
