import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../../shared/protocol';
import { RoomRegistry, Room } from '../rooms';
import { loadEpisodeByDate, loadRandomEpisode } from '../episode';
import { verifyToken } from '../auth/tokens';

export interface SocketData {
  code: string | null;
  userId: string | null;
  username: string | null;
}

type IO = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type ClientSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export function registerSocketHandlers(io: IO): RoomRegistry {
  const registry = new RoomRegistry();

  function broadcaster(code: string): () => void {
    return () => {
      try {
        const room = registry.get(code);
        io.to(`room:${code}`).emit('room_state', room.toRoomState());
        const extras = room.toHostExtras();
        if (extras) {
          io.to(`host:${code}`).emit('host_state', extras);
        }
      } catch {
        // Room is gone; silently drop.
      }
    };
  }

  function tearDownRoom(code: string, reason: string): void {
    io.to(`room:${code}`).emit('error_event', { message: reason });
    registry.destroy(code);
  }

  function detach(socket: ClientSocket, code: string, intentional: boolean): void {
    let room: Room;
    try {
      room = registry.get(code);
    } catch {
      socket.leave(`room:${code}`);
      socket.leave(`host:${code}`);
      return;
    }
    const userId = socket.data.userId!;
    const nowOffline = room.detach(userId, socket.id); // true if user has 0 sockets left

    if (intentional && room.phase === 'lobby' && userId !== room.hostId) {
      // Explicit "leave" from the lobby removes the seat immediately.
      room.removePlayer(userId);
      room.onChange();
    } else if (nowOffline) {
      room.setConnected(userId, false);
      room.onChange();
      room.schedulePresenceGrace(userId, () => tearDownIfHostGone(room, userId));
    }
    socket.leave(`room:${code}`);
    socket.leave(`host:${code}`);
    socket.data.code = null;
  }

  function tearDownIfHostGone(room: Room, userId: string): void {
    if (room.isOnline(userId)) return; // they came back
    if (userId === room.hostId && !room.autopilot) {
      tearDownRoom(room.code, 'Host left the game');
    } else if (room.phase === 'lobby') {
      room.removePlayer(userId);
      room.onChange();
    }
    // In-game contestants keep their seat/score; they simply stay "disconnected".
  }

  // Tiny helper that wraps a synchronous game action in the standard
  // ack + error path; broadcasts happen automatically via room.onChange().
  function handle(
    socket: ClientSocket,
    ack: (res: { ok: true; data: undefined } | { ok: false; error: string }) => void,
    fn: () => void
  ): void {
    try {
      fn();
      ack({ ok: true, data: undefined });
    } catch (e) {
      ack({ ok: false, error: (e as Error).message });
    }
  }

  io.on('connection', (socket: ClientSocket) => {
    const payload = verifyToken(
      (socket.handshake.auth as { token?: string } | undefined)?.token
    );
    if (!payload) {
      socket.emit('error_event', { message: 'Please log in again' });
      socket.disconnect(true);
      return;
    }
    const uid = String(payload.uid);
    const uname = payload.username;
    socket.data.code = null;
    socket.data.userId = uid;
    socket.data.username = uname;

    // ----- Lobby -----

    socket.on('create_room', ({ autopilot = false }, ack) => {
      try {
        const room = registry.create(uid, uname, autopilot, autopilot ? loadRandomEpisode : undefined);
        room.onBroadcast = broadcaster(room.code);
        socket.join(`room:${room.code}`);
        socket.data.code = room.code;
        if (autopilot) {
          // Creator joins as contestant; autopilot bot is the virtual host
          room.addContestant(uid, uname);
        } else {
          socket.join(`host:${room.code}`);
        }
        room.attach(uid, socket.id);
        ack({ ok: true, data: { code: room.code, playerId: uid } });
        room.onChange();
      } catch (e) {
        ack({ ok: false, error: (e as Error).message });
      }
    });

    socket.on('join_room', ({ code }, ack) => {
      try {
        const upper = code.toUpperCase();
        const room = registry.get(upper);
        if (room.hasPlayer(uid)) {
          room.reattach(uid, socket.id); // returning player / extra tab
        } else {
          room.addContestant(uid, uname);
          room.attach(uid, socket.id);
        }
        socket.join(`room:${upper}`);
        if (uid === room.hostId) socket.join(`host:${upper}`);
        socket.data.code = upper;
        ack({ ok: true, data: { playerId: uid } });
        room.onChange();
      } catch (e) {
        ack({ ok: false, error: (e as Error).message });
      }
    });

    socket.on('rejoin_room', ({ code }, ack) => {
      try {
        const upper = code.toUpperCase();
        const room = registry.get(upper);
        if (!room.hasPlayer(uid)) throw new Error('Not a member of this room');
        room.reattach(uid, socket.id);
        socket.join(`room:${upper}`);
        if (uid === room.hostId) socket.join(`host:${upper}`);
        socket.data.code = upper;
        ack({ ok: true, data: { playerId: uid } });
        room.onChange();
      } catch (e) {
        ack({ ok: false, error: (e as Error).message });
      }
    });

    socket.on('start_game', async ({ code, airDate }, ack) => {
      try {
        const room = registry.get(code);
        if (room.autopilot) throw new Error('Autopilot manages this room');
        if (uid !== room.hostId) throw new Error('Only the host can start the game');
        if (room.game) throw new Error('Game already started');
        if (room.contestants().length < 2) throw new Error('Need at least 2 contestants');

        const episode = airDate ? await loadEpisodeByDate(airDate) : await loadRandomEpisode();
        room.startGame(uid, episode);
        ack({ ok: true, data: undefined });
        room.onChange();
      } catch (e) {
        ack({ ok: false, error: (e as Error).message });
      }
    });

    socket.on('set_episode_selection', ({ code, airDate, categories = [] }, ack) => {
      handle(socket, ack, () => {
        const room = registry.get(code);
        room.setSelectedEpisode(uid, airDate, categories);
        room.onChange();
      });
    });

    socket.on('player_ready', ({ code }, ack) => {
      handle(socket, ack, () => {
        const room = registry.get(code);
        room.setReady(uid);
        room.onChange();
      });
    });

    socket.on('restart_game', ({ code }, ack) => {
      try {
        const room = registry.get(code);
        room.restartGame(uid);
        ack({ ok: true, data: undefined });
        room.onChange();
      } catch (e) {
        ack({ ok: false, error: (e as Error).message });
      }
    });

    // ----- Game actions -----

    socket.on('pick_clue', ({ code, round, category, value }, ack) => {
      handle(socket, ack, () => registry.get(code).pickClue(uid, round, category, value));
    });

    socket.on('arm_buzzers', ({ code }, ack) => {
      handle(socket, ack, () => registry.get(code).armBuzzers(uid));
    });

    socket.on('buzz', ({ code }, ack) => {
      handle(socket, ack, () => registry.get(code).buzz(uid));
    });

    socket.on('submit_answer', ({ code, text }, ack) => {
      handle(socket, ack, () => registry.get(code).submitAnswer(uid, text));
    });

    socket.on('judge', ({ code, correct }, ack) => {
      handle(socket, ack, () => registry.get(code).judge(uid, correct));
    });

    socket.on('next_clue', ({ code }, ack) => {
      handle(socket, ack, () => registry.get(code).nextClue(uid));
    });

    socket.on('submit_wager', ({ code, amount }, ack) => {
      handle(socket, ack, () => registry.get(code).submitWager(uid, amount));
    });

    socket.on('start_next_round', ({ code }, ack) => {
      handle(socket, ack, () => registry.get(code).startNextRound(uid));
    });

    socket.on('reveal_next_final', ({ code }, ack) => {
      handle(socket, ack, () => registry.get(code).revealNextFinal(uid));
    });

    socket.on('judge_final', ({ code, correct }, ack) => {
      handle(socket, ack, () => registry.get(code).judgeFinal(uid, correct));
    });

    // ----- Disconnect -----

    socket.on('leave', ({ code }) => {
      detach(socket, code, true);
    });

    socket.on('disconnect', () => {
      const code = socket.data.code;
      if (code) detach(socket, code, false);
    });
  });

  return registry;
}
