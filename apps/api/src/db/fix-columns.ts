import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://rs_user:rs_pass@localhost:5432/restosync',
});

async function fix() {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='menu_items' ORDER BY ordinal_position`,
  );
  console.log('menu_items columns:', cols.rows.map((r) => r.column_name).join(', '));

  await pool.query(`
    ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS photo_url_nobg  TEXT,
      ADD COLUMN IF NOT EXISTS is_featured     BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_hot          BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS sold_out        BOOLEAN DEFAULT false
  `);
  console.log('ALTER TABLE OK');

  const cols2 = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='menu_items' ORDER BY ordinal_position`,
  );
  console.log('After:', cols2.rows.map((r) => r.column_name).join(', '));

  await pool.end();
}

fix().catch((e) => { console.error(e.message); process.exit(1); });
