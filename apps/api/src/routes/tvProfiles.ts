import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/db';
import { tv_content_profiles } from '../db/schema';
import { authenticate } from '../middleware/auth';
import type { JWTPayload } from '../types';

const tvProfilesPlugin: FastifyPluginAsync = async (app) => {
  // GET /api/tv-profiles — list profiles for this store
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const { store_id } = req.user as JWTPayload;

    // AG-001: store_id WHERE 필수
    const profiles = await db
      .select()
      .from(tv_content_profiles)
      .where(eq(tv_content_profiles.store_id, store_id))
      .orderBy(tv_content_profiles.profile_name);

    return reply.send(profiles);
  });
};

export default tvProfilesPlugin;
