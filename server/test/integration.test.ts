import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Server as IOServer } from 'socket.io';
import { io as ClientIO, type Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers, type SocketData } from '../src/socket/handlers';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  RoomState,
  AckResult,
} from '../../shared/protocol';

let app: FastifyInstance;
let port: number;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no port');
  port = addr.port;
  const io = new IOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(app.server, { cors: { origin: true } });
  registerSocketHandlers(io);
});

afterAll(async () => {
  await app.close();
});

type CSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

function connect(): CSocket {
  return ClientIO(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
}

function awaitConnected(socket: CSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) return resolve();
    socket.once('connect', () => resolve());
    socket.once('connect_error', (err) => reject(err));
  });
}

function emit<TArgs, TRes>(
  socket: CSocket,
  event: keyof ClientToServerEvents,
  data: TArgs
): Promise<TRes> {
  return new Promise((resolve) => {
    // socket.io's typed emit signature is awkward across the test boundary
    (socket.emit as unknown as (e: string, d: TArgs, ack: (r: TRes) => void) => void)(
      event as string,
      data,
      resolve
    );
  });
}

// Latches every room_state so that .waitFor can check past states too —
// avoids the race where a state event fires before the listener is registered.
class StateWatcher {
  latest: RoomState | null = null;
  constructor(private socket: CSocket) {
    socket.on('room_state', (s) => {
      this.latest = s;
    });
  }
  waitFor(
    predicate: (s: RoomState) => boolean,
    timeoutMs = 3000
  ): Promise<RoomState> {
    if (this.latest && predicate(this.latest)) {
      return Promise.resolve(this.latest);
    }
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.socket.off('room_state', handler);
        reject(new Error('timeout waiting for room_state'));
      }, timeoutMs);
      const handler = (s: RoomState) => {
        if (predicate(s)) {
          clearTimeout(t);
          this.socket.off('room_state', handler);
          resolve(s);
        }
      };
      this.socket.on('room_state', handler);
    });
  }
}

async function cleanup(...sockets: CSocket[]) {
  for (const s of sockets) s.disconnect();
  await new Promise((r) => setTimeout(r, 50));
}

describe('lobby flow over real sockets', () => {
  it('full happy path: create → 2 joins → start', async () => {
    const host = connect();
    const alice = connect();
    const bob = connect();

    try {
      await Promise.all([
        awaitConnected(host),
        awaitConnected(alice),
        awaitConnected(bob),
      ]);

      const created = await emit<{ name: string }, AckResult<{ code: string; playerId: string }>>(
        host,
        'create_room',
        { name: 'Host' }
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const code = created.data.code;
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);

      const aliceJoin = await emit<{ code: string; name: string }, AckResult<{ playerId: string }>>(
        alice,
        'join_room',
        { code, name: 'Alice' }
      );
      expect(aliceJoin.ok).toBe(true);

      const bobJoin = await emit<{ code: string; name: string }, AckResult<{ playerId: string }>>(
        bob,
        'join_room',
        { code, name: 'Bob' }
      );
      expect(bobJoin.ok).toBe(true);

      const watcher = new StateWatcher(host);

      const fullLobby = await watcher.waitFor((s) => s.players.length === 3);
      expect(fullLobby.phase).toBe('lobby');
      expect(fullLobby.players.filter((p) => p.role === 'contestant').map((p) => p.name).sort()).toEqual(
        ['Alice', 'Bob']
      );

      const started = await emit<{ code: string }, AckResult>(host, 'start_game', { code });
      expect(started.ok).toBe(true);

      const gameStarted = await watcher.waitFor((s) => s.phase === 'show_board');
      expect(gameStarted.phase).toBe('show_board');
    } finally {
      await cleanup(host, alice, bob);
    }
  });

  it('rejects join with unknown code', async () => {
    const c = connect();
    try {
      await awaitConnected(c);
      const res = await emit<{ code: string; name: string }, AckResult<{ playerId: string }>>(
        c,
        'join_room',
        { code: 'XXXX', name: 'Late' }
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/not found/i);
    } finally {
      await cleanup(c);
    }
  });

  it('rejects start with only one contestant', async () => {
    const host = connect();
    const alice = connect();
    try {
      await Promise.all([awaitConnected(host), awaitConnected(alice)]);
      const created = await emit<{ name: string }, AckResult<{ code: string; playerId: string }>>(
        host,
        'create_room',
        { name: 'Host' }
      );
      if (!created.ok) throw new Error(created.error);
      await emit(alice, 'join_room', { code: created.data.code, name: 'Alice' });
      const start = await emit<{ code: string }, AckResult>(host, 'start_game', {
        code: created.data.code,
      });
      expect(start.ok).toBe(false);
      if (!start.ok) expect(start.error).toMatch(/2/);
    } finally {
      await cleanup(host, alice);
    }
  });

  it('only the host can start', async () => {
    const host = connect();
    const alice = connect();
    const bob = connect();
    try {
      await Promise.all([awaitConnected(host), awaitConnected(alice), awaitConnected(bob)]);
      const created = await emit<{ name: string }, AckResult<{ code: string; playerId: string }>>(
        host,
        'create_room',
        { name: 'Host' }
      );
      if (!created.ok) throw new Error(created.error);
      const code = created.data.code;
      await emit(alice, 'join_room', { code, name: 'Alice' });
      await emit(bob, 'join_room', { code, name: 'Bob' });
      const start = await emit<{ code: string }, AckResult>(alice, 'start_game', { code });
      expect(start.ok).toBe(false);
      if (!start.ok) expect(start.error).toMatch(/host/i);
    } finally {
      await cleanup(host, alice, bob);
    }
  });

  it('host disconnect tears the room down for everyone', async () => {
    const host = connect();
    const alice = connect();
    try {
      await Promise.all([awaitConnected(host), awaitConnected(alice)]);
      const created = await emit<{ name: string }, AckResult<{ code: string; playerId: string }>>(
        host,
        'create_room',
        { name: 'Host' }
      );
      if (!created.ok) throw new Error(created.error);
      await emit(alice, 'join_room', { code: created.data.code, name: 'Alice' });

      const errorPromise = new Promise<string>((resolve) =>
        alice.once('error_event', ({ message }) => resolve(message))
      );

      host.disconnect();
      const msg = await errorPromise;
      expect(msg).toMatch(/host left/i);
    } finally {
      await cleanup(alice);
    }
  });

  it('contestant leave updates other players', async () => {
    const host = connect();
    const alice = connect();
    const bob = connect();
    try {
      await Promise.all([awaitConnected(host), awaitConnected(alice), awaitConnected(bob)]);
      const created = await emit<{ name: string }, AckResult<{ code: string; playerId: string }>>(
        host,
        'create_room',
        { name: 'Host' }
      );
      if (!created.ok) throw new Error(created.error);
      const code = created.data.code;
      await emit(alice, 'join_room', { code, name: 'Alice' });
      await emit(bob, 'join_room', { code, name: 'Bob' });

      const watcher = new StateWatcher(host);
      await watcher.waitFor((s) => s.players.length === 3);

      alice.disconnect();
      const after = await watcher.waitFor((s) => s.players.length === 2, 3000);
      expect(after.players.find((p) => p.name === 'Alice')).toBeUndefined();
      expect(after.players.find((p) => p.name === 'Bob')).toBeDefined();
    } finally {
      await cleanup(host, bob);
    }
  });
});
