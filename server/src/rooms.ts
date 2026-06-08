import type {
  Episode,
  HostExtras,
  Phase,
  Player,
  RoomState,
} from '../../shared/protocol';
import { Game } from './game/machine';
import { judgeAnswer } from './game/aiJudge';
import { loadEpisodeByDate } from './episode';
import { recordGameResult } from './auth/users';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
const CODE_LENGTH = 4;
const MAX_CONTESTANTS = 4;
const MIN_CONTESTANTS = 2;

const AUTOPILOT_ARM_MS = 2500;
const AUTOPILOT_NEXT_MS = 3000;
const AUTOPILOT_BETWEEN_MS = 4000;
const AUTOPILOT_FJ_MS = 2000;
const AUTOPILOT_RESTART_MS = 8000;
const AUTOPILOT_START_DELAY_MS = 1500; // pause after all-ready before game starts
const AUTOPILOT_JUDGE_MS = 700; // small "thinking" beat before the verdict

export function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export class Room {
  readonly code: string;
  readonly autopilot: boolean;
  readonly creatorId: string;
  hostId: string;
  players: Map<string, Player> = new Map();
  game: Game | null = null;
  onBroadcast: () => void = () => {};
  selectedEpisode: { airDate: string; categories: string[] } | null = null;

  private readyPlayers: Set<string> = new Set();
  private autopilotTimer: NodeJS.Timeout | null = null;
  private autoStartTimer: NodeJS.Timeout | null = null;
  private readonly loadEpisode?: () => Promise<Episode>;

  private online: Map<string, Set<string>> = new Map(); // userId -> socket ids
  private graceTimers: Map<string, NodeJS.Timeout> = new Map();
  private resultsRecorded = false;

  constructor(
    code: string,
    hostId: string,
    hostName: string,
    creatorId: string,
    autopilot = false,
    loadEpisode?: () => Promise<Episode>
  ) {
    this.code = code;
    this.autopilot = autopilot;
    this.hostId = hostId;
    this.creatorId = creatorId;
    this.loadEpisode = loadEpisode;
    if (!autopilot) {
      this.players.set(hostId, {
        id: hostId,
        name: hostName,
        role: 'host',
        score: 0,
        connected: true,
      });
    }
  }

  onChange(): void {
    this.onBroadcast();
    if (this.game && this.game.phase === 'game_over' && !this.resultsRecorded) {
      this.resultsRecorded = true;
      this.recordResults();
    }
    if (this.autopilot) this.triggerAutopilot();
  }

  // ----- Presence tracking (multi-socket aware) -----

  hasPlayer(userId: string): boolean {
    return this.players.has(userId) || userId === this.hostId;
  }

  attach(userId: string, socketId: string): void {
    let set = this.online.get(userId);
    if (!set) {
      set = new Set();
      this.online.set(userId, set);
    }
    set.add(socketId);
    this.cancelPresenceGrace(userId);
    this.setConnected(userId, true);
  }

  // Used when a known player returns (refresh / extra tab / reconnect).
  reattach(userId: string, socketId: string): void {
    this.attach(userId, socketId);
  }

  detach(userId: string, socketId: string): boolean {
    const set = this.online.get(userId);
    if (set) {
      set.delete(socketId);
      if (set.size === 0) this.online.delete(userId);
    }
    return !this.online.has(userId);
  }

  isOnline(userId: string): boolean {
    return this.online.has(userId);
  }

  schedulePresenceGrace(userId: string, fn: () => void): void {
    this.cancelPresenceGrace(userId);
    const ms = Number(process.env.PRESENCE_GRACE_MS ?? 45000);
    this.graceTimers.set(
      userId,
      setTimeout(() => {
        this.graceTimers.delete(userId);
        fn();
      }, ms)
    );
  }

  private cancelPresenceGrace(userId: string): void {
    const t = this.graceTimers.get(userId);
    if (t) {
      clearTimeout(t);
      this.graceTimers.delete(userId);
    }
  }

  private recordResults(): void {
    if (!this.game) return;
    const winner = this.game.winner;
    const results = this.contestants()
      .map((c) => ({
        userId: Number(c.id),
        score: this.game!.scores.get(c.id) ?? 0,
        won: c.id === winner,
      }))
      .filter((r) => Number.isFinite(r.userId)); // skip 'autopilot' & non-numeric ids
    void recordGameResult(results); // fire-and-forget; never blocks the broadcast
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
    this.readyPlayers.delete(playerId);
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
    this.resultsRecorded = false;
    this.game = new Game(episode, this.contestants(), () => this.onChange());
  }

  setSelectedEpisode(requesterId: string, airDate: string | null, categories: string[]): void {
    const canManage = requesterId === this.hostId || requesterId === this.creatorId;
    if (!canManage) throw new Error('Not authorized to select an episode');
    if (this.game) throw new Error('Game already in progress');
    this.selectedEpisode = airDate ? { airDate, categories } : null;
  }

  setReady(playerId: string): void {
    if (this.phase !== 'lobby') throw new Error('Game already started');
    if (!this.players.has(playerId)) throw new Error('Not in this room');
    this.readyPlayers.add(playerId);
    if (this.autopilot) this.scheduleAutoStartIfAllReady();
  }

  private scheduleAutoStartIfAllReady(): void {
    if (this.game || this.autoStartTimer) return;
    const contestants = this.contestants();
    if (contestants.length < MIN_CONTESTANTS) return;
    if (!contestants.every((c) => this.readyPlayers.has(c.id))) return;

    this.autoStartTimer = setTimeout(async () => {
      this.autoStartTimer = null;
      if (this.game) return;
      const current = this.contestants();
      if (current.length < MIN_CONTESTANTS) return;
      if (!current.every((c) => this.readyPlayers.has(c.id))) return;
      try {
        const episode = this.selectedEpisode
          ? await loadEpisodeByDate(this.selectedEpisode.airDate)
          : await this.loadEpisode!();
        if (this.game) return;
        this.startGame('autopilot', episode);
        this.onChange();
      } catch { /* ignore */ }
    }, AUTOPILOT_START_DELAY_MS);
  }

  restartGame(requesterId: string): void {
    if (requesterId !== this.hostId) {
      throw new Error('Only the host can restart');
    }
    if (this.game) {
      this.game.cleanup();
      this.game = null;
    }
    this.readyPlayers.clear();
    this.selectedEpisode = null;
    this.resultsRecorded = false;
  }

  cleanup(): void {
    if (this.autopilotTimer) { clearTimeout(this.autopilotTimer); this.autopilotTimer = null; }
    if (this.autoStartTimer) { clearTimeout(this.autoStartTimer); this.autoStartTimer = null; }
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.graceTimers.clear();
    if (this.game) this.game.cleanup();
  }

  // ----- Autopilot -----

  private scheduleAutopilot(ms: number, fn: () => void | Promise<void>): void {
    if (this.autopilotTimer) clearTimeout(this.autopilotTimer);
    this.autopilotTimer = setTimeout(async () => {
      this.autopilotTimer = null;
      try { await fn(); } catch { /* ignore */ }
    }, ms);
  }

  private triggerAutopilot(): void {
    if (!this.game) return;
    const game = this.game;
    const phase = game.phase;

    if (phase === 'clue_reading') {
      this.scheduleAutopilot(AUTOPILOT_ARM_MS, () => {
        this.armBuzzers('autopilot');
      });

    } else if (phase === 'judging') {
      const submitted = game.currentAnswerText ?? '';
      const correct = game.currentClue?.correctResponse ?? '';
      const clueText = game.currentClue?.clueText ?? '';
      this.scheduleAutopilot(AUTOPILOT_JUDGE_MS, async () => {
        const isCorrect = await judgeAnswer({ clueText, correctResponse: correct, submitted });
        // Re-check: nothing else advances while autopilot awaits, but guard anyway.
        if (!this.game || this.game.phase !== 'judging') return;
        this.judge('autopilot', isCorrect);
      });

    } else if (phase === 'clue_closed') {
      this.scheduleAutopilot(AUTOPILOT_NEXT_MS, () => {
        this.nextClue('autopilot');
      });

    } else if (phase === 'between_rounds') {
      this.scheduleAutopilot(AUTOPILOT_BETWEEN_MS, () => {
        this.startNextRound('autopilot');
      });

    } else if (phase === 'fj_reveal') {
      if (game.fjPendingJudge) {
        const { answer } = game.fjPendingJudge;
        const correct = game.episode.final.correctResponse;
        const clueText = game.episode.final.clueText;
        this.scheduleAutopilot(AUTOPILOT_FJ_MS, async () => {
          const isCorrect = await judgeAnswer({ clueText, correctResponse: correct, submitted: answer });
          if (!this.game || !this.game.fjPendingJudge) return;
          this.judgeFinal('autopilot', isCorrect);
        });
      } else {
        this.scheduleAutopilot(AUTOPILOT_FJ_MS, () => {
          this.revealNextFinal('autopilot');
        });
      }

    } else if (phase === 'game_over') {
      this.scheduleAutopilot(AUTOPILOT_RESTART_MS, async () => {
        if (!this.game || this.game.phase !== 'game_over') return;
        this.restartGame('autopilot');
        this.onChange(); // broadcasts lobby state — players must press ready again
      });
    }
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
      creatorId: this.creatorId,
      autopilot: this.autopilot,
      players,
      game: this.game?.toPublicState() ?? null,
      selectedEpisode: this.selectedEpisode,
      readyPlayerIds: [...this.readyPlayers],
    };
  }

  toHostExtras(): HostExtras | null {
    return this.game?.toHostExtras() ?? null;
  }
}

export class RoomRegistry {
  private rooms: Map<string, Room> = new Map();

  create(
    creatorId: string,
    hostName: string,
    autopilot = false,
    loadEpisode?: () => Promise<Episode>
  ): Room {
    const trimmed = hostName.trim();
    if (!trimmed) throw new Error('Name required');
    if (trimmed.length > 20) throw new Error('Name must be 20 characters or less');
    let code: string;
    do {
      code = generateCode();
    } while (this.rooms.has(code));
    const hostId = autopilot ? 'autopilot' : creatorId;
    const room = new Room(code, hostId, trimmed, creatorId, autopilot, loadEpisode);
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
