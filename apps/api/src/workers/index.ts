// Worker process entrypoint — Sprint 2 S2.7 (AG-022)
//
// 별 프로세스로 실행되어 메인 API thread를 점유하지 않는다.
// 실행:  pnpm --filter @restosync/api worker
//
// 향후 import job worker, ai_ocr worker 등을 여기 추가.

import { startTranscodeWorker, __stopTranscodeWorker } from './imageTranscodeWorker';
import { startImportWorker, __stopImportWorker } from './importWorker';
import { __shutdown as stopTranscodeQueue } from '../services/transcodeQueue';
import { __shutdown as stopImportQueue } from '../services/importQueue';
import { isR2Configured, isAnyStorageConfigured } from '../lib/r2Client';

const log = (...a: unknown[]) => console.log('[worker]', ...a);

async function main(): Promise<void> {
  log('starting…');
  log(`  NODE_ENV     = ${process.env.NODE_ENV ?? 'development'}`);
  log(`  REDIS_URL    = ${process.env.REDIS_URL ?? 'redis://localhost:6379'}`);
  log(`  R2 endpoint  = ${process.env.R2_ENDPOINT ?? '(none — AWS fallback)'}`);
  if (!isAnyStorageConfigured()) {
    log('  ⚠ no storage configured (R2_BUCKET / S3_BUCKET missing) — transcode jobs will fail');
  } else if (!isR2Configured()) {
    log('  ℹ R2 not configured — using AWS S3 default endpoint');
  }

  const w = startTranscodeWorker();
  if (!w) {
    log('  ✗ transcode worker not started (test env or no Redis) — exiting');
    process.exit(1);
  }
  log('  ✓ transcode worker online (concurrency=2)');

  const iw = startImportWorker();
  if (iw) log('  ✓ import worker online (concurrency=1)');
  else    log('  ⚠ import worker not started (test env or no Redis)');

  const shutdown = async (signal: string) => {
    log(`received ${signal} — draining workers…`);
    try {
      await __stopTranscodeWorker();
      await __stopImportWorker();
      await stopTranscodeQueue();
      await stopImportQueue();
    } catch (err) {
      log('shutdown error:', err);
    }
    log('bye');
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));

  // 살아있는 동안 이벤트 루프 유지 — Worker가 active connection을 잡고 있어서
  // 따로 setInterval 같은 keep-alive 불필요.
}

void main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
