import type { FastifyInstance } from 'fastify';
import { getTopCategories, loadRandomEpisode, searchEpisodes } from './episode';

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

  app.get<{ Querystring: { year?: string } }>('/api/categories', async (req, reply) => {
    const yearRaw = req.query.year ? parseInt(req.query.year, 10) : null;
    const year = yearRaw !== null && !isNaN(yearRaw) ? yearRaw : null;
    try {
      return await getTopCategories(year);
    } catch (e) {
      reply.code(500);
      return { error: (e as Error).message };
    }
  });

  app.get<{ Querystring: { q?: string; year?: string } }>(
    '/api/episodes/search',
    async (req, reply) => {
      const q = (req.query.q ?? '').trim();
      if (!q || q.length < 2) {
        reply.code(400);
        return { error: 'Query must be at least 2 characters' };
      }
      const yearRaw = req.query.year ? parseInt(req.query.year, 10) : null;
      const year = yearRaw !== null && !isNaN(yearRaw) ? yearRaw : null;
      try {
        return await searchEpisodes(q, year);
      } catch (e) {
        reply.code(500);
        return { error: (e as Error).message };
      }
    }
  );
}
