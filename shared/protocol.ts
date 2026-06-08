// Shared socket.io event contract. Imported by both server and client.

export type Role = 'host' | 'contestant';

export type Phase =
  | 'lobby'
  | 'show_board'
  | 'clue_reading'
  | 'buzz_open'
  | 'answering'
  | 'judging'
  | 'clue_closed'
  | 'daily_double_wager'
  | 'between_rounds'
  | 'fj_category'
  | 'fj_wager'
  | 'fj_clue'
  | 'fj_answer'
  | 'fj_reveal'
  | 'game_over';

export interface Player {
  id: string;
  name: string;
  role: Role;
  score: number;
  connected: boolean;
}

// ----- Episode / board -----

export interface BoardClue {
  category: string;
  value: number;          // board-position value (e.g. 200, 400)
  isDailyDouble: boolean;
  clueText: string;       // shown on the board (the source TSV's "answer" column)
  correctResponse: string; // what contestants must say (TSV's "question" column)
}

export interface Round {
  number: 1 | 2;
  categories: string[];
  clues: BoardClue[];
}

export interface FinalJeopardy {
  category: string;
  clueText: string;
  correctResponse: string;
}

export interface Episode {
  airDate: string;
  round1: Round;
  round2: Round;
  final: FinalJeopardy;
}

// ----- Game state visible to everyone -----

export interface ClearedClueRef {
  round: number;
  category: string;
  value: number;
}

export interface RevealedClue {
  round: number;
  category: string;
  value: number;
  isDailyDouble: boolean;
  clueText: string;
  correctResponse: string | null; // populated only after the clue closes
}

export interface FinalReveal {
  playerId: string;
  wager: number;
  answer: string;
  correct: boolean;
}

export interface RoundView {
  number: 1 | 2;
  categories: string[];
  valueTiers: number[];
}

export interface PublicGameState {
  round: 1 | 2 | 3;
  scores: Record<string, number>;
  currentPicker: string | null;
  cleared: ClearedClueRef[];
  round1: RoundView;
  round2: RoundView;
  currentClue: RevealedClue | null;
  buzzersArmed: boolean;
  buzzedIn: string | null;
  lockedOut: string[];
  ddWager: number | null;
  ddPlayer: string | null;
  finalCategory: string | null;
  finalClueText: string | null;
  finalCorrectResponse: string | null;
  fjEligible: string[];          // contestant ids eligible to play (score > 0)
  fjWagersSubmitted: string[];
  fjAnswersSubmitted: string[];
  fjReveals: FinalReveal[];
  fjPending: { playerId: string; wager: number; answer: string } | null;
  winner: string | null;
  buzzTimerEndsAt: number | null;
  answerTimerEndsAt: number | null;
}

export interface RoomState {
  code: string;
  phase: Phase;
  hostId: string;
  creatorId: string;
  autopilot: boolean;
  players: Player[];
  game: PublicGameState | null;
  selectedEpisode: { airDate: string; categories: string[] } | null;
  readyPlayerIds: string[];
}

// ----- Host-only extras -----

export interface HostExtras {
  currentClueResponse: string | null;
  currentBuzzedAnswerText: string | null;
  ddWagerSubmitted: boolean;
  fjWagers: Record<string, number>;
  fjAnswers: Record<string, string>;
}

// ----- Auth -----

export interface AuthUser {
  id: number;
  username: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

// ----- Wire protocol -----

export type AckResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface ClientToServerEvents {
  // Lobby
  create_room: (data: { autopilot?: boolean }, ack: (res: AckResult<{ code: string; playerId: string }>) => void) => void;
  join_room: (data: { code: string }, ack: (res: AckResult<{ playerId: string }>) => void) => void;
  rejoin_room: (data: { code: string }, ack: (res: AckResult<{ playerId: string }>) => void) => void;
  start_game: (data: { code: string; airDate?: string }, ack: (res: AckResult) => void) => void;
  player_ready: (data: { code: string }, ack: (res: AckResult) => void) => void;
  set_episode_selection: (data: { code: string; airDate: string | null; categories?: string[] }, ack: (res: AckResult) => void) => void;

  // Game
  pick_clue: (
    data: { code: string; round: number; category: string; value: number },
    ack: (res: AckResult) => void
  ) => void;
  arm_buzzers: (data: { code: string }, ack: (res: AckResult) => void) => void;
  buzz: (data: { code: string }, ack: (res: AckResult) => void) => void;
  submit_answer: (data: { code: string; text: string }, ack: (res: AckResult) => void) => void;
  judge: (data: { code: string; correct: boolean }, ack: (res: AckResult) => void) => void;
  next_clue: (data: { code: string }, ack: (res: AckResult) => void) => void;
  submit_wager: (data: { code: string; amount: number }, ack: (res: AckResult) => void) => void;
  start_next_round: (data: { code: string }, ack: (res: AckResult) => void) => void;
  reveal_next_final: (data: { code: string }, ack: (res: AckResult) => void) => void;
  judge_final: (data: { code: string; correct: boolean }, ack: (res: AckResult) => void) => void;
  restart_game: (data: { code: string }, ack: (res: AckResult) => void) => void;

  leave: (data: { code: string }) => void;
}

export interface ServerToClientEvents {
  room_state: (state: RoomState) => void;
  host_state: (extras: HostExtras) => void;
  error_event: (data: { message: string }) => void;
}
