// Sprint 1 S1.16 — Menu audit log writer (BR-06)
// Usage: route 핸들러에서 mutation 직후 await logAudit({...}, req.log). AG-023 — commit 후 호출 권장.
// Append-only. operation/entity_type/actor는 enums.ts 정본.
//
// Sprint 1.5 hardening [AM01-011]:
//   - Fastify logger 우선 사용 (request_id 컨텍스트 자동 포함)
//   - 실패 시 Redis 카운터 `audit:fail:<store_id>` 증가 (24h TTL) → ops alerting
//   - 여전히 "never throws" 계약 유지

import { db } from '../db/db';
import { redis } from '../db/redis';
import { menu_audit_log } from '../db/schema';
import type {
  AuditEntityType, AuditOperation, AuditActor,
} from '@restosync/shared/enums';
import type { FastifyBaseLogger } from 'fastify';

export interface AuditEntry {
  store_id:    string;
  entity_type: AuditEntityType;
  entity_id:   string;
  operation:   AuditOperation;
  before?:     Record<string, unknown> | null;
  after?:      Record<string, unknown> | null;
  user_id?:    string;
  actor?:      AuditActor;
  reason?:     string;
}

const AUDIT_FAIL_TTL_SEC = 24 * 60 * 60;

/**
 * Append a single audit row. Never throws — audit failure must not break the request.
 * On failure:
 *   1. Log via Fastify logger if provided (structured, includes request_id/store_id)
 *   2. Increment Redis counter `audit:fail:<store_id>` for ops alerting (best-effort)
 *   3. Fall back to console.error if both logger and Redis are unavailable
 */
export async function logAudit(entry: AuditEntry, logger?: FastifyBaseLogger): Promise<void> {
  try {
    await db.insert(menu_audit_log).values({
      store_id:    entry.store_id,
      entity_type: entry.entity_type,
      entity_id:   entry.entity_id,
      operation:   entry.operation,
      before:      entry.before ?? null,
      after:       entry.after ?? null,
      user_id:     entry.user_id ?? null,
      actor:       entry.actor ?? 'staff',
      reason:      entry.reason ?? null,
    });
  } catch (err) {
    const context = {
      audit:       true,
      store_id:    entry.store_id,
      entity_type: entry.entity_type,
      entity_id:   entry.entity_id,
      operation:   entry.operation,
      user_id:     entry.user_id,
      err:         err instanceof Error ? err.message : String(err),
    };
    if (logger) {
      logger.error(context, '[audit] write failed — DB outage or constraint violation');
    } else {
      // eslint-disable-next-line no-console
      console.error('[audit] write failed', context);
    }
    // Best-effort failure counter — ops scrape via /health/metrics.
    // If Redis is also down, swallow silently (audit row already lost, additional logging is noise).
    redis.multi()
      .incr(`audit:fail:${entry.store_id}`)
      .expire(`audit:fail:${entry.store_id}`, AUDIT_FAIL_TTL_SEC)
      .exec()
      .catch(() => { /* noop */ });
  }
}
