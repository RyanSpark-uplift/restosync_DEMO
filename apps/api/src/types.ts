import type { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: JWTPayload;
  }
}

export interface JWTPayload {
  sub: string;        // user_id
  store_id: string;
  role: string;
  jti?: string;       // refresh token only
  type?: 'access' | 'refresh';
}
