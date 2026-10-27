import './types';
import fs from 'fs';
import path from 'path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { pool, db } from './db/db';
import { redis } from './db/redis';
import { sql } from 'drizzle-orm';
import authRoutes from './routes/auth';
import ordersRoutes from './routes/orders';
import menuRoutes from './routes/menu';
import menuVariantsRoutes from './routes/menuVariants';
import menuModifierGroupsRoutes from './routes/menuModifierGroups';
import menuItemModifierGroupsRoutes from './routes/menuItemModifierGroups';
import menuIngredientsRoutes from './routes/menuIngredients';
import menuItemIngredientsRoutes from './routes/menuItemIngredients';
import menuImportRoutes from './routes/menuImport';
import menuCategoriesRoutes from './routes/menuCategories';
import menuDaypartsRoutes from './routes/menuDayparts';
import menuFeaturedRoutes from './routes/menuFeatured';
import menuCombosRoutes from './routes/menuCombos';
import eventsRoutes from './routes/events';
import screensRoutes from './routes/screens';
import tvInstancesRoutes from './routes/tvInstances';
import tvPairingRoutes from './routes/tvPairing';
import tvProfilesRoutes from './routes/tvProfiles';
import venueGroupsRoutes from './routes/venueGroups';
import storeSettingsRoutes from './routes/storeSettings';
import { THEMES, THEME_DEFAULT_COLUMNS } from '@restosync/shared';
import analyticsRoutes from './routes/analytics';
import qrRoutes from './routes/qr';
import webhookRoutes from './routes/webhook';
import wsPlugin from './ws/handler';
import { startScheduler } from './services/scheduler';
import { startSmsWorker } from './services/smsDispatcher';

export async function buildServer() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  // AG-012: raw body 보존 — HMAC webhook 서명 검증용
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      (req as any).rawBody = body as Buffer;
      done(null, JSON.parse((body as Buffer).toString('utf8')));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Plugins
  await app.register(cors, {
    // Expo web dev server picks an ephemeral port (8081/8082/...) on first run.
    // In production, lock down via CORS_ORIGINS env.
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.CORS_ORIGINS?.split(',') ?? [])
      : true,
    credentials: true,
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-CHANGE-IN-PROD-min-256bit',
  });

  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(websocket);

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  });

  // S1.19 — OpenAPI 3.0 + Swagger UI (production은 admin 인증 뒤로 옮길 것)
  if (process.env.NODE_ENV !== 'production') {
    await app.register(swagger, {
      openapi: {
        openapi: '3.0.3',
        info: {
          title: 'RestoSync API',
          description: 'Restaurant 4-screen signage + pickup + tablet SaaS — auto-generated from Fastify routes',
          version: '1.0.0',
        },
        servers: [{ url: 'http://localhost:3000', description: 'local dev' }],
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
        tags: [
          { name: 'auth',     description: 'Login / refresh / me' },
          { name: 'menu',     description: 'Menu items + categories + dayparts (M01)' },
          { name: 'orders',   description: 'Order CRUD + status transitions' },
          { name: 'events',   description: 'Event board (M03)' },
          { name: 'screens',  description: 'TV pairing + heartbeat (M02)' },
          { name: 'webhook',  description: 'Delivery platform inbound (AG-012/019)' },
          { name: 'system',   description: 'Health, metrics' },
        ],
      },
    });
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: false },
    });

    // Auto-tag routes by URL prefix so the catalog stays organized
    // even when individual route files don't declare schema.tags.
    app.addHook('onRoute', (route) => {
      if (route.url.startsWith('/docs')) return;
      const existing = (route.schema ?? {}) as { tags?: string[] };
      if (existing.tags && existing.tags.length > 0) return;
      let tag = 'system';
      if (route.url.startsWith('/api/auth'))       tag = 'auth';
      else if (route.url.startsWith('/api/menu'))  tag = 'menu';
      else if (route.url.startsWith('/api/orders')) tag = 'orders';
      else if (route.url.startsWith('/api/events')) tag = 'events';
      else if (route.url.startsWith('/api/screens') || route.url.startsWith('/api/tv-')) tag = 'screens';
      else if (route.url.startsWith('/webhook'))   tag = 'webhook';
      route.schema = Object.assign({}, route.schema, { tags: [tag] });
    });
  }

  // Decorate with redis (types declared in types.ts)
  app.decorate('redis', redis);

  // AG-019: webhook ban check
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/webhook/')) return;
    const banned = await redis.get(`webhook:ban:${req.ip}`);
    if (banned) return reply.status(429).send({ error: 'BANNED' });
  });

  // Routes
  await app.register(authRoutes,   { prefix: '/api/auth' });
  await app.register(ordersRoutes, { prefix: '/api/orders' });
  await app.register(menuRoutes,           { prefix: '/api/menu' });
  await app.register(menuVariantsRoutes,       { prefix: '/api/menu' });
  await app.register(menuModifierGroupsRoutes,     { prefix: '/api/menu/modifier-groups' });
  await app.register(menuItemModifierGroupsRoutes, { prefix: '/api/menu' });
  await app.register(menuIngredientsRoutes,        { prefix: '/api/menu/ingredients' });
  await app.register(menuItemIngredientsRoutes,    { prefix: '/api/menu' });
  await app.register(menuImportRoutes,             { prefix: '/api/menu/import' });
  await app.register(menuCategoriesRoutes,         { prefix: '/api/menu/categories' });
  await app.register(menuDaypartsRoutes,   { prefix: '/api/menu/dayparts' });
  await app.register(menuFeaturedRoutes,   { prefix: '/api/menu/featured' });
  await app.register(menuCombosRoutes,     { prefix: '/api/menu/combos' });
  await app.register(eventsRoutes, { prefix: '/api/events' });
  await app.register(screensRoutes,     { prefix: '/api/screens' });
  await app.register(tvInstancesRoutes,  { prefix: '/api/tv-instances' });
  // tvPairingRoutes shares the /api/tv-instances prefix — pair-request,
  // pair-status, pair-claim are sub-paths of the tv-instances resource.
  await app.register(tvPairingRoutes,    { prefix: '/api/tv-instances' });
  await app.register(tvProfilesRoutes,   { prefix: '/api/tv-profiles' });
  await app.register(venueGroupsRoutes,  { prefix: '/api/venue-groups' });
  await app.register(storeSettingsRoutes, { prefix: '/api/store_settings' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(qrRoutes, { prefix: '/qr' });
  await app.register(webhookRoutes);
  await app.register(wsPlugin);

  // node-cron 스케줄러 + SMS worker (test 환경 제외)
  if (process.env.NODE_ENV !== 'test') {
    startScheduler();
    startSmsWorker();
  }

  // GET /uploads/* — 업로드 이미지 정적 서빙
  app.get('/uploads/*', async (req, reply) => {
    const safeSuffix = req.url.replace(/\.\./g, '').replace(/\/\/+/g, '/');
    const filePath   = path.join(process.cwd(), safeSuffix);
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    if (!filePath.startsWith(uploadsRoot)) return reply.status(403).send();
    if (!fs.existsSync(filePath))          return reply.status(404).send();
    const ext  = path.extname(filePath).toLowerCase();
    const mime: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png',  '.webp': 'image/webp', '.gif': 'image/gif',
    };
    reply.type(mime[ext] ?? 'application/octet-stream');
    return reply.send(fs.createReadStream(filePath));
  });

  // GET /tablet — 태블릿 SPA 서빙 (개발용)
  app.get('/tablet', async (_req, reply) => {
    const htmlPath = path.resolve(__dirname, '../../tablet/index.html');
    if (!fs.existsSync(htmlPath)) {
      return reply.status(404).send('Tablet app not found');
    }
    return reply.type('text/html').send(fs.readFileSync(htmlPath));
  });

  // GET /tv-view — 브라우저 기반 TV viewer (E2E 테스트용, 실제 TV는 apps/tv RN 빌드).
  // no-store: dev iteration on the static asset must reach the browser without F5 dance.
  // The HTML carries a /* THEMES_INLINE_PLACEHOLDER */ token which we replace with
  // the JSON-serialised 12-theme catalogue from @restosync/shared — single source
  // of truth, no second fetch needed.
  app.get('/tv-view', async (_req, reply) => {
    const htmlPath = path.resolve(__dirname, '../public/tv-view.html');
    if (!fs.existsSync(htmlPath)) {
      return reply.status(404).send('TV viewer not found');
    }
    const themesInline =
      `window.RESTOSYNC_THEMES = ${JSON.stringify(THEMES)};\n` +
      `window.THEME_DEFAULT_COLUMNS = ${JSON.stringify(THEME_DEFAULT_COLUMNS)};`;
    const html = fs.readFileSync(htmlPath, 'utf8')
      .replace('/* THEMES_INLINE_PLACEHOLDER */', themesInline);
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    return reply.type('text/html').send(html);
  });

  // GET /health/metrics — Prometheus text exposition format. Spec P4-B.
  // No auth: assume reverse proxy/network gate. AG-009 exemption.
  app.get('/health/metrics', async (_req, reply) => {
    const lines: string[] = [];

    // pg pool
    const pgPool = pool as unknown as { totalCount?: number; idleCount?: number; waitingCount?: number };
    lines.push('# HELP rs_pg_pool_total Total connections in pg pool');
    lines.push('# TYPE rs_pg_pool_total gauge');
    lines.push(`rs_pg_pool_total ${pgPool.totalCount ?? 0}`);
    lines.push('# HELP rs_pg_pool_idle Idle connections in pg pool');
    lines.push('# TYPE rs_pg_pool_idle gauge');
    lines.push(`rs_pg_pool_idle ${pgPool.idleCount ?? 0}`);
    lines.push('# HELP rs_pg_pool_waiting Waiters for connection');
    lines.push('# TYPE rs_pg_pool_waiting gauge');
    lines.push(`rs_pg_pool_waiting ${pgPool.waitingCount ?? 0}`);

    // redis ping
    let redisMs = -1;
    try {
      const t = Date.now();
      const r = await redis.ping();
      if (r === 'PONG') redisMs = Date.now() - t;
    } catch { /* noop */ }
    lines.push('# HELP rs_redis_ping_ms Redis ping round-trip in ms (-1 on error)');
    lines.push('# TYPE rs_redis_ping_ms gauge');
    lines.push(`rs_redis_ping_ms ${redisMs}`);

    // audit log size (rough rate proxy)
    try {
      const [{ n }] = await db.execute(sql<{ n: number }>`SELECT count(*)::int AS n FROM order_state_transitions WHERE ts > now() - interval '1 hour'`) as unknown as Array<{ n: number }>;
      lines.push('# HELP rs_audit_log_writes_1h Audit log inserts in last 1 hour');
      lines.push('# TYPE rs_audit_log_writes_1h gauge');
      lines.push(`rs_audit_log_writes_1h ${n ?? 0}`);
    } catch { /* table may not exist in pre-P1 DB */ }

    // Sprint 1.5 — audit write failures per store (24h window via Redis TTL)
    // [AM01-011] audit DB outage 시 카운터로 ops alerting.
    try {
      const keys = await redis.keys('audit:fail:*');
      let totalFails = 0;
      for (const k of keys) {
        const v = await redis.get(k);
        totalFails += parseInt(v ?? '0', 10) || 0;
      }
      lines.push('# HELP rs_audit_write_failures_24h Audit log write failures across all stores in last 24h');
      lines.push('# TYPE rs_audit_write_failures_24h gauge');
      lines.push(`rs_audit_write_failures_24h ${totalFails}`);
    } catch { /* redis down — silently skip metric */ }

    // active orders snapshot
    try {
      const [{ active }] = await db.execute(sql<{ active: number }>`SELECT count(*)::int AS active FROM orders WHERE status IN ('new','prep','ready_to_expedite','ready','remaking','scheduled')`) as unknown as Array<{ active: number }>;
      lines.push('# HELP rs_orders_active Currently non-terminal orders');
      lines.push('# TYPE rs_orders_active gauge');
      lines.push(`rs_orders_active ${active ?? 0}`);
    } catch { /* noop */ }

    reply.type('text/plain; version=0.0.4').send(lines.join('\n') + '\n');
  });

  // GET /health — DB + Redis 상태 포함
  app.get('/health', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      const pong = await redis.ping();
      return reply.send({
        status: 'ok',
        db: 'ok',
        redis: pong === 'PONG' ? 'ok' : 'warn',
        ts: new Date().toISOString(),
        env: process.env.NODE_ENV ?? 'development',
      });
    } catch (err) {
      return reply.status(503).send({
        status: 'error',
        message: (err as Error).message,
      });
    }
  });

  // 표준 에러 응답 (UX-AUDIT)
  app.setErrorHandler((error, _req, reply) => {
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      error: error.code ?? 'INTERNAL_ERROR',
      message: error.message,
      statusCode,
    });
  });

  return app;
}
