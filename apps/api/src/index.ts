import { buildServer } from './server';
import { redis } from './db/redis';
import { pool } from './db/db';
import { __shutdown as stopTranscodeQueue } from './services/transcodeQueue';

async function main() {
  const app = await buildServer();

  await redis.connect();

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });

  const shutdown = async () => {
    await app.close();
    // Worker는 별 프로세스이므로 여기서는 queue producer side만 정리.
    await stopTranscodeQueue();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
