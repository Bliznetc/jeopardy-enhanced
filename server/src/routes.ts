import type { FastifyInstance } from 'fastify';
import { loadRandomEpisode } from './episode';

export function registerHttpRoutes(app: FastifyInstance): void {
  app.get('/health', async () => ({ ok: true }));

  app.get('/api/episode', async (_req, reply) => {
    try {
      return await loadRandomEpisode();
    } catch (e) {
      reply.code(500);
      return { error: (e as Error).message };
    }
  });
}
