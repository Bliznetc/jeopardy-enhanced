import './env';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { Server as IOServer } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../shared/protocol';
import { registerSocketHandlers, type SocketData } from './socket/handlers';
import { registerHttpRoutes } from './routes';
import { ensureAuthSchema } from './auth/schema';

const PORT = Number(process.env.PORT ?? 3001);

const app = Fastify({ logger: { level: 'info' } });
await app.register(cors, { origin: true });
await app.register(rateLimit, {
  global: false,
  max: 20,
  timeWindow: '1 minute',
});

registerHttpRoutes(app);
await ensureAuthSchema();

await app.listen({ port: PORT, host: '0.0.0.0' });

const io = new IOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>(app.server, {
  cors: { origin: true },
});

registerSocketHandlers(io);

app.log.info(`Socket.IO listening on :${PORT}`);
