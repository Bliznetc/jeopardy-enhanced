import type { FastifyInstance } from 'fastify';
import { getTopCategories, loadRandomEpisode, searchEpisodes } from './episode';
import { authenticate, createUser, validateCredentials } from './auth/users';
import { signToken, verifyToken } from './auth/tokens';

export function registerHttpRoutes(app: FastifyInstance): void {
  app.get('/health', async () => ({ ok: true }));

  app.post<{ Body: { username?: string; password?: string } }>(
    '/api/auth/register',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const username = (req.body?.username ?? '').trim();
      const password = req.body?.password ?? '';
      try {
        validateCredentials(username, password);
        const user = await createUser(username, password);
        const token = signToken({ uid: user.id, username: user.username });
        return { token, user };
      } catch (e) {
        reply.code(400);
        return { error: (e as Error).message };
      }
    }
  );

  app.post<{ Body: { username?: string; password?: string } }>(
    '/api/auth/login',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const username = (req.body?.username ?? '').trim();
      const password = req.body?.password ?? '';
      try {
        const user = await authenticate(username, password);
        const token = signToken({ uid: user.id, username: user.username });
        return { token, user };
      } catch (e) {
        reply.code(401);
        return { error: (e as Error).message };
      }
    }
  );

  app.get('/api/auth/me', async (req, reply) => {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    const payload = verifyToken(token);
    if (!payload) {
      reply.code(401);
      return { error: 'Invalid or expired token' };
    }
    return { user: { id: payload.uid, username: payload.username } };
  });

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
