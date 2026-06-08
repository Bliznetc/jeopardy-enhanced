import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RoomState, AckResult } from '../../shared/protocol';
import {
  type CSocket,
  type TestServer,
  type TestUser,
  connectAuthed,
  registerUser,
  startTestServer,
} from './authHelpers';

let server: TestServer;
let port: number;

beforeAll(async () => {
  // Shorten the disconnect grace window so teardown assertions are fast.
  process.env.PRESENCE_GRACE_MS = '100';
  server = await startTestServer();
  port = server.port;
});

afterAll(async () => {
  await server.app.close();
});

function awaitConnected(socket: CSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) return resolve();
    socket.once('connect', () => resolve());
    socket.once('connect_error', (err) => reject(err));
  });
}

function emit<TArgs, TRes>(
  socket: CSocket,
  event: string,
  data: TArgs
): Promise<TRes> {
  return new Promise((resolve) => {
    (socket.emit as unknown as (e: string, d: TArgs, ack: (r: TRes) => void) => void)(
      event,
      data,
      resolve
    );
  });
}

// Latches every room_state so .waitFor can check past states too.
class StateWatcher {
  latest: RoomState | null = null;
  constructor(private socket: CSocket) {
    socket.on('room_state', (s) => {
      this.latest = s;
    });
  }
  waitFor(predicate: (s: RoomState) => boolean, timeoutMs = 3000): Promise<RoomState> {
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

async function trio(): Promise<{ host: TestUser; alice: TestUser; bob: TestUser }> {
  const [host, alice, bob] = await Promise.all([
    registerUser(port, 'host'),
    registerUser(port, 'alice'),
    registerUser(port, 'bob'),
  ]);
  return { host, alice, bob };
}

describe('lobby flow over real sockets', () => {
  it('full happy path: create → 2 joins → start', async () => {
    const u = await trio();
    const host = connectAuthed(port, u.host.token);
    const alice = connectAuthed(port, u.alice.token);
    const bob = connectAuthed(port, u.bob.token);

    try {
      await Promise.all([awaitConnected(host), awaitConnected(alice), awaitConnected(bob)]);

      const created = await emit<{ autopilot: boolean }, AckResult<{ code: string; playerId: string }>>(
        host,
        'create_room',
        { autopilot: false }
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const code = created.data.code;
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);

      const aliceJoin = await emit<{ code: string }, AckResult<{ playerId: string }>>(
        alice,
        'join_room',
        { code }
      );
      expect(aliceJoin.ok).toBe(true);

      const bobJoin = await emit<{ code: string }, AckResult<{ playerId: string }>>(
        bob,
        'join_room',
        { code }
      );
      expect(bobJoin.ok).toBe(true);

      const watcher = new StateWatcher(host);

      const fullLobby = await watcher.waitFor((s) => s.players.length === 3);
      expect(fullLobby.phase).toBe('lobby');
      expect(
        fullLobby.players.filter((p) => p.role === 'contestant').map((p) => p.name).sort()
      ).toEqual([u.alice.username, u.bob.username].sort());

      const started = await emit<{ code: string }, AckResult>(host, 'start_game', { code });
      expect(started.ok).toBe(true);

      const gameStarted = await watcher.waitFor((s) => s.phase === 'show_board');
      expect(gameStarted.phase).toBe('show_board');
    } finally {
      await cleanup(host, alice, bob);
    }
  });

  it('rejects join with unknown code', async () => {
    const late = await registerUser(port, 'late');
    const c = connectAuthed(port, late.token);
    try {
      await awaitConnected(c);
      const res = await emit<{ code: string }, AckResult<{ playerId: string }>>(c, 'join_room', {
        code: 'XXXX',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/not found/i);
    } finally {
      await cleanup(c);
    }
  });

  it('rejects start with only one contestant', async () => {
    const u = await trio();
    const host = connectAuthed(port, u.host.token);
    const alice = connectAuthed(port, u.alice.token);
    try {
      await Promise.all([awaitConnected(host), awaitConnected(alice)]);
      const created = await emit<{ autopilot: boolean }, AckResult<{ code: string; playerId: string }>>(
        host,
        'create_room',
        { autopilot: false }
      );
      if (!created.ok) throw new Error(created.error);
      await emit(alice, 'join_room', { code: created.data.code });
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
    const u = await trio();
    const host = connectAuthed(port, u.host.token);
    const alice = connectAuthed(port, u.alice.token);
    const bob = connectAuthed(port, u.bob.token);
    try {
      await Promise.all([awaitConnected(host), awaitConnected(alice), awaitConnected(bob)]);
      const created = await emit<{ autopilot: boolean }, AckResult<{ code: string; playerId: string }>>(
        host,
        'create_room',
        { autopilot: false }
      );
      if (!created.ok) throw new Error(created.error);
      const code = created.data.code;
      await emit(alice, 'join_room', { code });
      await emit(bob, 'join_room', { code });
      const start = await emit<{ code: string }, AckResult>(alice, 'start_game', { code });
      expect(start.ok).toBe(false);
      if (!start.ok) expect(start.error).toMatch(/host/i);
    } finally {
      await cleanup(host, alice, bob);
    }
  });

  it('host disconnect tears the room down after the grace window', async () => {
    const u = await trio();
    const host = connectAuthed(port, u.host.token);
    const alice = connectAuthed(port, u.alice.token);
    try {
      await Promise.all([awaitConnected(host), awaitConnected(alice)]);
      const created = await emit<{ autopilot: boolean }, AckResult<{ code: string; playerId: string }>>(
        host,
        'create_room',
        { autopilot: false }
      );
      if (!created.ok) throw new Error(created.error);
      await emit(alice, 'join_room', { code: created.data.code });

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
    const u = await trio();
    const host = connectAuthed(port, u.host.token);
    const alice = connectAuthed(port, u.alice.token);
    const bob = connectAuthed(port, u.bob.token);
    try {
      await Promise.all([awaitConnected(host), awaitConnected(alice), awaitConnected(bob)]);
      const created = await emit<{ autopilot: boolean }, AckResult<{ code: string; playerId: string }>>(
        host,
        'create_room',
        { autopilot: false }
      );
      if (!created.ok) throw new Error(created.error);
      const code = created.data.code;
      await emit(alice, 'join_room', { code });
      await emit(bob, 'join_room', { code });

      const watcher = new StateWatcher(host);
      await watcher.waitFor((s) => s.players.length === 3);

      alice.disconnect();
      const after = await watcher.waitFor((s) => s.players.length === 2, 3000);
      expect(after.players.find((p) => p.name === u.alice.username)).toBeUndefined();
      expect(after.players.find((p) => p.name === u.bob.username)).toBeDefined();
    } finally {
      await cleanup(host, bob);
    }
  });

  it('rejects unauthenticated sockets', async () => {
    const c = connectAuthed(port, 'garbage.token');
    try {
      const err = await new Promise<string>((resolve) => {
        c.once('error_event', ({ message }) => resolve(message));
      });
      expect(err).toMatch(/log in/i);
    } finally {
      await cleanup(c);
    }
  });
});
