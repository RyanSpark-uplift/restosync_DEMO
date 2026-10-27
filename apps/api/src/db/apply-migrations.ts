/**
 * Manual migration runner for migrations 0003 and 0004
 * (0001/0002 were applied manually — 0003/0004 contain new tables/enums)
 */
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://rs_user:rs_pass@localhost:5432/restosync',
  });

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = ['0003_fix_enum_drift.sql', '0004_add_venue_tv_promotions.sql'];

  for (const file of files) {
    console.log(`\n[migration] Applying ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    // Split on semicolons; strip comment lines before checking emptiness
    const statements = sql
      .split(';')
      .map((chunk) => {
        // Remove comment lines, collapse whitespace
        const nonComment = chunk
          .split('\n')
          .filter((line) => !line.trim().startsWith('--'))
          .join('\n')
          .trim();
        return nonComment;
      })
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      try {
        await pool.query(stmt);
        console.log(`  ✓ ${stmt.slice(0, 60).replace(/\n/g, ' ')}...`);
      } catch (e: unknown) {
        const msg = (e as Error).message;
        // Ignore "already exists" errors — idempotent
        if (msg.includes('already exists') || msg.includes('duplicate')) {
          console.log(`  ~ already exists: ${stmt.slice(0, 40).replace(/\n/g, ' ')}`);
        } else {
          console.error(`  ✗ FAILED: ${msg}`);
          console.error(`    Statement: ${stmt.slice(0, 80)}`);
        }
      }
    }
  }

  // Verify
  const r = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
  );
  console.log('\nTables now:', r.rows.map((x) => x.tablename).join(', '));

  await pool.end();
}

run().catch((e) => { console.error(e.message); process.exit(1); });
