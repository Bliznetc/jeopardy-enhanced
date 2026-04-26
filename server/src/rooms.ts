import type {
  Episode,
  HostExtras,
  Phase,
  Player,
  RoomState,
} from '../../shared/protocol';
import { Game } from './game/machine';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
const CODE_LENGTH = 4;
const MAX_CONTESTANTS = 4;
const MIN_CONTESTANTS = 2;

export function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export class Room {
  readonly code: string;
  hostId: string;
  players: Map<string, Player> = new Map();
  game: Game | null = null;
  onChange: () => void = () => {};

  constructor(code: string, hostId: string, hostName: string) {
    this.code = code;
    this.hostId = hostId;
    this.players.set(hostId, {
      id: hostId,
      name: hostName,
      role: 'host',
      score: 0,
      connected: true,
    });
  }

  get phase(): Phase {
    return this.game?.phase ?? 'lobby';
  }

  contestants(): Player[] {
    return [...this.players.values()].filter((p) => p.role === 'contestant');
  }

  addContestant(playerId: string, name: string): void {
    if (this.phase !== 'lobby') {
      throw new Error('Game already in progress');
    }
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Name required');
    if (trimmed.length > 20) throw new Error('Name must be 20 characters or less');
    if (this.contestants().length >= MAX_CONTESTANTS) {
      throw new Error(`Room is full (max ${MAX_CONTESTANTS} contestants)`);
    }
    if (this.players.has(playerId)) return;
    this.players.set(playerId, {
      id: playerId,
      name: trimmed,
      role: 'contestant',
      score: 0,
      connected: true,
    });
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
  }

  setConnected(playerId: string, connected: boolean): void {
    const player = this.players.get(playerId);
    if (player) player.connected = connected;
  }

  startGame(requesterId: string, episode: Episode): void {
    if (requesterId !== this.hostId) {
      throw new Error('Only the host can start the game');
    }
    if (this.game) throw new Error('Game already started');
    if (this.contestants().length < MIN_CONTESTANTS) {
      throw new Error(`Need at least ${MIN_CONTESTANTS} contestants`);
    }
    this.game = new Game(episode, this.contestants(), () => this.onChange());
  }

  restartGame(requesterId: string): void {
    if (requesterId !== this.hostId) {
      throw new Error('Only the host can restart');
    }
    if (this.game) {
      this.game.cleanup();
      this.game = null;
    }
  }

  cleanup(): void {
    if (this.game) this.game.cleanup();
  }

  // ----- Game delegations -----

  private requireGame(): Game {
    if (!this.game) throw new Error('No game in progress');
    return this.game;
  }

  pickClue(playerId: string, round: number, category: string, value: number): void {
    this.requireGame().pickClue(playerId, round, category, value);
  }
  armBuzzers(playerId: string): void {
    this.requireGame().armBuzzersDDAware(playerId, this.hostId);
  }
  buzz(playerId: string): void {
    this.requireGame().buzz(playerId);
  }
  submitAnswer(playerId: string, text: string): void {
    this.requireGame().submitAnswer(playerId, text);
  }
  judge(playerId: string, correct: boolean): void {
    this.requireGame().judge(playerId, this.hostId, correct);
  }
  nextClue(playerId: string): void {
    this.requireGame().nextClue(playerId, this.hostId);
  }
  submitWager(playerId: string, amount: number): void {
    this.requireGame().submitWager(playerId, amount);
  }
  startNextRound(playerId: string): void {
    this.requireGame().startNextRound(playerId, this.hostId);
  }
  revealNextFinal(playerId: string): void {
    this.requireGame().revealNextFinal(playerId, this.hostId);
  }
  judgeFinal(playerId: string, correct: boolean): void {
    this.requireGame().judgeFinal(playerId, this.hostId, correct);
  }

  // ----- Views -----

  toRoomState(): RoomState {
    const players = [...this.players.values()].map((p) =>
      p.role === 'contestant' && this.game
        ? { ...p, score: this.game.scores.get(p.id) ?? 0 }
        : p
    );
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      players,
      game: this.game?.toPublicState() ?? null,
    };
  }

  toHostExtras(): HostExtras | null {
    return this.game?.toHostExtras() ?? null;
  }
}

export class RoomRegistry {
  private rooms: Map<string, Room> = new Map();

  create(hostId: string, hostName: string): Room {
    const trimmed = hostName.trim();
    if (!trimmed) throw new Error('Name required');
    if (trimmed.length > 20) throw new Error('Name must be 20 characters or less');
    let code: string;
    do {
      code = generateCode();
    } while (this.rooms.has(code));
    const room = new Room(code, hostId, trimmed);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new Error('Room not found');
    return room;
  }

  has(code: string): boolean {
    return this.rooms.has(code.toUpperCase());
  }

  destroy(code: string): void {
    const r = this.rooms.get(code.toUpperCase());
    if (r) r.cleanup();
    this.rooms.delete(code.toUpperCase());
  }

  size(): number {
    return this.rooms.size;
  }
}
