import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.status(401).send({ error: 'UNAUTHORIZED', statusCode: 401 });
  }
}
