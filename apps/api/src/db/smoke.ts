import { buildServer } from '../server';
import { Pool } from 'pg';

async function main() {
  const app = await buildServer();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address() as { port: number };
  console.log('Server port:', addr.port);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query(
    `SELECT id FROM users WHERE store_id = $1 AND name = 'Ryan' LIMIT 1`,
    ['97313de4-f52c-4381-91dd-cbc491b58943'],
  );
  await pool.end();

  if (!r.rows.length) { console.error('No seed user found'); process.exit(1); }
  const userId = r.rows[0].id as string;
  console.log('userId:', userId);

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      store_id: '97313de4-f52c-4381-91dd-cbc491b58943',
      user_id: userId,
      pin: '1234',
    },
  });
  console.log('login status:', loginRes.statusCode);
  if (loginRes.statusCode !== 200) {
    console.error('body:', loginRes.body);
  } else {
    const jwt = loginRes.json<{ access_token: string }>().access_token;
    console.log('jwt (first 40):', jwt.slice(0, 40));

    // Test WS — `ws` is a transitive dep of @fastify/websocket; no @types installed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const WebSocket: any = require('ws');
    const STORE_ID = '97313de4-f52c-4381-91dd-cbc491b58943';
    const ws = new WebSocket(
      `ws://127.0.0.1:${addr.port}/ws?store_id=${STORE_ID}&token=${jwt}&device_type=tv&role=menu`,
    );
    ws.on('open', () => console.log('WS open'));
    ws.on('message', (d: Buffer) => {
      console.log('WS message:', d.toString().slice(0, 120));
      ws.close();
    });
    ws.on('close', (code: number, reason: Buffer) => {
      console.log('WS close:', code, reason.toString());
      app.close().then(() => process.exit(0));
    });
    ws.on('error', (e: Error) => {
      console.error('WS error:', e.message);
      app.close().then(() => process.exit(1));
    });
    setTimeout(() => { console.log('WS timeout'); app.close().then(() => process.exit(1)); }, 5000);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
