import { Pool } from 'pg';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://rs_user:rs_pass@localhost:5432/restosync',
  });

  const r = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
  );
  console.log('Tables:', r.rows.map((x) => x.tablename).join(', '));

  try {
    const j = await pool.query(
      `SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at`,
    );
    console.log('Applied migrations:', j.rows.length);
    j.rows.forEach((x: Record<string, string>) => console.log(' -', x.hash?.slice(0, 16), x.created_at));
  } catch {
    console.log('No drizzle journal');
  }

  await pool.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
