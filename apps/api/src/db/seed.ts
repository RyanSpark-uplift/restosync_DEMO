import bcrypt from 'bcrypt';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://rs_user:rs_pass@localhost:5432/restosync',
});
const db = drizzle(pool, { schema });

async function seed() {
  console.log('[seed] demo-store-a n\' Apple 데이터 초기화...');

  // 1. Store
  const [store] = await db
    .insert(schema.stores)
    .values({
      name: "Demo Store A",
      slug: 'demo-store-a',
      license_key: 'RS-TEST-0001-AAAA',
      timezone: 'America/Los_Angeles',
      brand_color: '#E8450A',
    })
    .onConflictDoUpdate({ target: schema.stores.slug, set: { name: "Demo Store A" } })
    .returning();

  console.log('[seed] store:', store.id);

  // 2. Staff user (PIN: 1234)
  const pin_hash = await bcrypt.hash('1234', 10);
  const [user] = await db
    .insert(schema.users)
    .values({
      store_id: store.id,
      name: 'Ryan',
      pin_hash,
      role: 'owner',
    })
    .onConflictDoNothing()
    .returning();

  console.log('[seed] user:', user?.id ?? '(already exists)');

  // 3. Menu items (5개)
  const menuData = [
    { name: 'demo-store-a Sandwich', category: 'Sandwiches', price: '12.99', sort_order: 1 },
    { name: 'Spicy Apple Burger', category: 'Burgers', price: '13.99', sort_order: 2 },
    { name: 'Classic Fries', category: 'Sides', price: '3.99', sort_order: 3 },
    { name: 'Lemonade', category: 'Drinks', price: '2.99', sort_order: 4 },
    { name: 'Chicken Tenders (3pc)', category: 'Chicken', price: '10.99', sort_order: 5 },
  ];

  for (const item of menuData) {
    await db
      .insert(schema.menu_items)
      .values({ store_id: store.id, ...item, available: true })
      .onConflictDoNothing();
  }
  console.log('[seed] menu items: 5개');

  // 4. Event (happy_hour — 비활성, 미래 시작)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(17, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(19, 0, 0, 0);

  await db
    .insert(schema.events)
    .values({
      store_id: store.id,
      title: 'Happy Hour',
      type: 'happy_hour',
      ticker_text: '🍗 Happy Hour 5-7PM — 20% off all drinks!',
      start_at: tomorrow,
      end_at: tomorrowEnd,
      active: false,
    })
    .onConflictDoNothing();
  console.log('[seed] event: Happy Hour');

  // 5. TV Screens (menu/pickup/event)
  const screenRoles: Array<typeof schema.tv_screens.$inferInsert['role']> = ['menu', 'pickup', 'event'];
  const screenNames = ['Menu Board TV', 'Pickup Display TV', 'Event Board TV'];

  for (let i = 0; i < screenRoles.length; i++) {
    await db
      .insert(schema.tv_screens)
      .values({
        store_id: store.id,
        role: screenRoles[i],
        name: screenNames[i],
        online: false,
      })
      .onConflictDoNothing();
  }
  console.log('[seed] tv_screens: 3개 (menu/pickup/event)');

  console.log('[seed] ✅ 완료');
  console.log('  Store ID:', store.id);
  console.log('  PIN: 1234');
  await pool.end();
}

seed().catch((err) => {
  console.error('[seed] 실패:', err);
  process.exit(1);
});
