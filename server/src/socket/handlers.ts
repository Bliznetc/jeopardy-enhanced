import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../../shared/protocol';
import { RoomRegistry } from '../rooms';
import { loadEpisodeByDate, loadRandomEpisode } from '../episode';

export interface SocketData {
  code: string | null;
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

  function handleLeave(socket: ClientSocket, code: string): void {
    let room;
    try {
      room = registry.get(code);
    } catch {
      socket.leave(`room:${code}`);
      socket.leave(`host:${code}`);
      return;
    }
    if (socket.id === room.hostId) {
      tearDownRoom(room.code, 'Host left the game');
    } else if (room.phase === 'lobby') {
      room.removePlayer(socket.id);
      room.onChange();
    } else {
      room.setConnected(socket.id, false);
      room.onChange();
    }
    socket.leave(`room:${room.code}`);
    socket.leave(`host:${room.code}`);
    socket.data.code = null;
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
    socket.data.code = null;

    // ----- Lobby -----

    socket.on('create_room', ({ name, autopilot = false }, ack) => {
      try {
        const room = registry.create(socket.id, name, autopilot, autopilot ? loadRandomEpisode : undefined);
        room.onBroadcast = broadcaster(room.code);
        socket.join(`room:${room.code}`);
        socket.data.code = room.code;
        if (autopilot) {
          // Creator joins as contestant; autopilot bot is the virtual host
          room.addContestant(socket.id, name);
        } else {
          socket.join(`host:${room.code}`);
        }
        ack({ ok: true, data: { code: room.code, playerId: socket.id } });
        room.onChange();
      } catch (e) {
        ack({ ok: false, error: (e as Error).message });
      }
    });

    socket.on('join_room', ({ code, name }, ack) => {
      try {
        const upper = code.toUpperCase();
        const room = registry.get(upper);
        room.addContestant(socket.id, name);
        socket.join(`room:${upper}`);
        socket.data.code = upper;
        ack({ ok: true, data: { playerId: socket.id } });
        room.onChange();
      } catch (e) {
        ack({ ok: false, error: (e as Error).message });
      }
    });

    socket.on('start_game', async ({ code, airDate }, ack) => {
      try {
        const room = registry.get(code);
        if (room.autopilot) throw new Error('Autopilot manages this room');
        if (socket.id !== room.hostId) throw new Error('Only the host can start the game');
        if (room.game) throw new Error('Game already started');
        if (room.contestants().length < 2) throw new Error('Need at least 2 contestants');

        const episode = airDate ? await loadEpisodeByDate(airDate) : await loadRandomEpisode();
        room.startGame(socket.id, episode);
        ack({ ok: true, data: undefined });
        room.onChange();
      } catch (e) {
        ack({ ok: false, error: (e as Error).message });
      }
    });

    socket.on('set_episode_selection', ({ code, airDate, categories = [] }, ack) => {
      handle(socket, ack, () => {
        const room = registry.get(code);
        room.setSelectedEpisode(socket.id, airDate, categories);
        room.onChange();
      });
    });

    socket.on('player_ready', ({ code }, ack) => {
      handle(socket, ack, () => {
        const room = registry.get(code);
        room.setReady(socket.id);
        room.onChange();
      });
    });

    socket.on('restart_game', ({ code }, ack) => {
      try {
        const room = registry.get(code);
        room.restartGame(socket.id);
        ack({ ok: true, data: undefined });
        room.onChange();
      } catch (e) {
        ack({ ok: false, error: (e as Error).message });
      }
    });

    // ----- Game actions -----

    socket.on('pick_clue', ({ code, round, category, value }, ack) => {
      handle(socket, ack, () => registry.get(code).pickClue(socket.id, round, category, value));
    });

    socket.on('arm_buzzers', ({ code }, ack) => {
      handle(socket, ack, () => registry.get(code).armBuzzers(socket.id));
    });

    socket.on('buzz', ({ code }, ack) => {
      handle(socket, ack, () => registry.get(code).buzz(socket.id));
    });

    socket.on('submit_answer', ({ code, text }, ack) => {
      handle(socket, ack, () => registry.get(code).submitAnswer(socket.id, text));
    });

    socket.on('judge', ({ code, correct }, ack) => {
      handle(socket, ack, () => registry.get(code).judge(socket.id, correct));
    });

    socket.on('next_clue', ({ code }, ack) => {
      handle(socket, ack, () => registry.get(code).nextClue(socket.id));
    });

    socket.on('submit_wager', ({ code, amount }, ack) => {
      handle(socket, ack, () => registry.get(code).submitWager(socket.id, amount));
    });

    socket.on('start_next_round', ({ code }, ack) => {
      handle(socket, ack, () => registry.get(code).startNextRound(socket.id));
    });

    socket.on('reveal_next_final', ({ code }, ack) => {
      handle(socket, ack, () => registry.get(code).revealNextFinal(socket.id));
    });

    socket.on('judge_final', ({ code, correct }, ack) => {
      handle(socket, ack, () => registry.get(code).judgeFinal(socket.id, correct));
    });

    // ----- Disconnect -----

    socket.on('leave', ({ code }) => {
      handleLeave(socket, code);
    });

    socket.on('disconnect', () => {
      const code = socket.data.code;
      if (code) handleLeave(socket, code);
    });
  });

  return registry;
}
