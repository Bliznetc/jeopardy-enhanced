import Fastify, { type FastifyInstance } from 'fastify';
import { Server as IOServer } from 'socket.io';
import { io as ClientIO, type Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers, type SocketData } from '../src/socket/handlers';
import { registerHttpRoutes } from '../src/routes';
import { ensureAuthSchema } from '../src/auth/schema';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../shared/protocol';

export interface TestServer {
  app: FastifyInstance;
  port: number;
}

// Boots a Fastify + Socket.IO server with HTTP auth routes and the users table,
// suitable for end-to-end socket tests. Requires a reachable Postgres.
export async function startTestServer(): Promise<TestServer> {
  const app = Fastify({ logger: false });
  // No rate-limit plugin here: the per-route `config.rateLimit` metadata is
  // simply ignored when the plugin isn't registered, so tests aren't throttled.
  registerHttpRoutes(app);
  await ensureAuthSchema();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no port');
  const io = new IOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(app.server, { cors: { origin: true } });
  registerSocketHandlers(io);
  return { app, port: addr.port };
}

export interface TestUser {
  token: string;
  username: string;
  userId: string;
}

// Registers a unique user over HTTP and returns its token + identity.
export async function registerUser(port: number, base: string): Promise<TestUser> {
  const username = `${base}${Math.random().toString(36).slice(2, 8)}`.slice(0, 20);
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123' }),
  });
  const data = (await res.json()) as { token: string; user: { id: number; username: string } };
  if (!res.ok) throw new Error((data as unknown as { error: string }).error);
  return { token: data.token, username: data.user.username, userId: String(data.user.id) };
}

export type CSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

export function connectAuthed(port: number, token: string): CSocket {
  return ClientIO(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    auth: { token },
  });
}
