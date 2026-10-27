// Sprint 1 — RBAC helper (M01 §9 + AM01-008)
// Usage: { preHandler: [authenticate, requireRole(['owner','manager'])] }

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JWTPayload } from '../types';

export type Role = 'owner' | 'manager' | 'staff' | 'kitchen';

export function requireRole(allowed: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as JWTPayload | undefined;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const role = (user.role ?? 'staff') as Role;
    if (!allowed.includes(role)) {
      return reply.status(403).send({ error: 'FORBIDDEN', required: allowed, actual: role });
    }
  };
}
