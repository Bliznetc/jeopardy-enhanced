import type {
  BoardClue,
  Episode,
  FinalReveal,
  HostExtras,
  Phase,
  PublicGameState,
  RoundView,
} from '../../../shared/protocol';
import {
  ascendingScoreOrder,
  chooseInitialPicker,
  clueKey,
  isValidDDWager,
  isValidFJWager,
} from './scoring';

const BUZZ_WINDOW_MS = 5000;
const ANSWER_WINDOW_MS = 7000;
const FJ_ANSWER_WINDOW_MS = 30000;

type Round = 1 | 2 | 3;

export interface GameOptions {
  buzzWindowMs?: number;
  answerWindowMs?: number;
  fjAnswerWindowMs?: number;
  pickerOverride?: string; // for deterministic tests
}

export class Game {
  phase: Phase = 'show_board';
  round: Round = 1;

  scores: Map<string, number>;
  contestantIds: string[];
  currentPicker: string;

  cleared: Set<string> = new Set();          // clueKey()
  currentClue: BoardClue | null = null;
  currentClueRound: Round | null = null;     // round of currentClue (could differ during display)

  // Buzzer / answer state
  buzzersArmed = false;
  buzzedIn: string | null = null;
  lockedOut: Set<string> = new Set();
  currentAnswerText: string | null = null;
  answerer: string | null = null;            // who is currently answering

  // Daily Double
  ddPlayer: string | null = null;
  ddWager: number | null = null;

  // Final Jeopardy
  fjEligible: string[] = [];
  fjWagers: Map<string, number> = new Map();
  fjAnswers: Map<string, string> = new Map();
  fjRevealOrder: string[] = [];
  fjReveals: FinalReveal[] = [];
  fjPendingJudge: { playerId: string; wager: number; answer: string } | null = null;

  winner: string | null = null;

  private buzzTimer: NodeJS.Timeout | null = null;
  private answerTimer: NodeJS.Timeout | null = null;
  private fjAnswerTimer: NodeJS.Timeout | null = null;

  constructor(
    public episode: Episode,
    contestants: { id: string }[],
    public onChange: () => void,
    private opts: GameOptions = {}
  ) {
    this.contestantIds = contestants.map((c) => c.id);
    this.scores = new Map(this.contestantIds.map((id) => [id, 0]));
    this.currentPicker = opts.pickerOverride ?? chooseInitialPicker(this.contestantIds);
  }

  // ----- Helpers -----

  private currentRoundClues(): BoardClue[] {
    if (this.round === 1) return this.episode.round1.clues;
    if (this.round === 2) return this.episode.round2.clues;
    return [];
  }

  private currentValueTiers(): number[] {
    const clues = this.currentRoundClues();
    return [...new Set(clues.map((c) => c.value))].sort((a, b) => a - b);
  }

  private findClue(round: number, category: string, value: number): BoardClue | undefined {
    const clues = round === 1 ? this.episode.round1.clues : round === 2 ? this.episode.round2.clues : [];
    return clues.find((c) => c.category === category && c.value === value);
  }

  private requirePhase(...allowed: Phase[]): void {
    if (!allowed.includes(this.phase)) {
      throw new Error(`Cannot do that in phase "${this.phase}"`);
    }
  }

  private clearBuzzTimer(): void {
    if (this.buzzTimer) {
      clearTimeout(this.buzzTimer);
      this.buzzTimer = null;
    }
  }
  private clearAnswerTimer(): void {
    if (this.answerTimer) {
      clearTimeout(this.answerTimer);
      this.answerTimer = null;
    }
  }
  private clearFJAnswerTimer(): void {
    if (this.fjAnswerTimer) {
      clearTimeout(this.fjAnswerTimer);
      this.fjAnswerTimer = null;
    }
  }

  cleanup(): void {
    this.clearBuzzTimer();
    this.clearAnswerTimer();
    this.clearFJAnswerTimer();
  }

  // ----- Transitions -----

  pickClue(playerId: string, round: number, category: string, value: number): void {
    this.requirePhase('show_board');
    if (round !== this.round) throw new Error('Wrong round');
    if (playerId !== this.currentPicker) throw new Error('Only the current picker can pick');
    const key = clueKey(round, category, value);
    if (this.cleared.has(key)) throw new Error('Clue already used');

    const clue = this.findClue(round, category, value);
    if (!clue) throw new Error('Clue not found');

    this.currentClue = clue;
    this.currentClueRound = round as Round;
    this.lockedOut.clear();
    this.currentAnswerText = null;
    this.answerer = null;
    this.buzzedIn = null;

    if (clue.isDailyDouble) {
      this.ddPlayer = playerId;
      this.ddWager = null;
      this.phase = 'daily_double_wager';
    } else {
      this.ddPlayer = null;
      this.ddWager = null;
      this.phase = 'clue_reading';
    }
    this.onChange();
  }

  armBuzzers(hostId: string, currentHostId: string): void {
    this.requirePhase('clue_reading');
    if (hostId !== currentHostId) throw new Error('Only the host can arm buzzers');
    if (!this.currentClue) throw new Error('No clue to read');
    this.buzzersArmed = true;
    this.phase = 'buzz_open';
    this.clearBuzzTimer();
    const window = this.opts.buzzWindowMs ?? BUZZ_WINDOW_MS;
    this.buzzTimer = setTimeout(() => this.handleBuzzTimeout(), window);
    this.onChange();
  }

  buzz(playerId: string): void {
    this.requirePhase('buzz_open');
    if (!this.contestantIds.includes(playerId)) throw new Error('Only contestants buzz');
    if (this.lockedOut.has(playerId)) throw new Error('Locked out for this clue');
    if (this.buzzedIn) return; // first buzz wins; later buzzes silently ignored
    this.buzzersArmed = false;
    this.buzzedIn = playerId;
    this.answerer = playerId;
    this.currentAnswerText = null;
    this.phase = 'answering';
    this.clearBuzzTimer();
    this.clearAnswerTimer();
    this.answerTimer = setTimeout(
      () => this.handleAnswerTimeout(),
      this.opts.answerWindowMs ?? ANSWER_WINDOW_MS
    );
    this.onChange();
  }

  submitAnswer(playerId: string, text: string): void {
    this.requirePhase('answering', 'fj_clue', 'fj_answer');
    if (this.phase === 'answering') {
      if (playerId !== this.answerer) throw new Error('Not your turn to answer');
      this.currentAnswerText = text;
      this.clearAnswerTimer();
      this.phase = 'judging';
      this.onChange();
      return;
    }
    // FJ answer submission
    if (!this.fjEligible.includes(playerId)) throw new Error('Not eligible for Final Jeopardy');
    if (this.fjAnswers.has(playerId)) throw new Error('Final answer already submitted');
    this.fjAnswers.set(playerId, text);
    if (this.allFJAnswersIn()) this.advanceFJToReveal();
    this.onChange();
  }

  judge(hostId: string, currentHostId: string, correct: boolean): void {
    if (hostId !== currentHostId) throw new Error('Only the host can judge');
    this.requirePhase('judging');
    if (!this.currentClue || !this.answerer) throw new Error('No active clue/answerer');

    const isDD = this.ddPlayer !== null;
    const value = isDD ? (this.ddWager ?? 0) : this.currentClue.value;
    const delta = correct ? value : -value;
    this.scores.set(this.answerer, (this.scores.get(this.answerer) ?? 0) + delta);

    if (correct) {
      // Correct answer was just stated aloud, so we skip the "clue_closed"
      // reveal screen and go straight back to picking.
      this.currentPicker = this.answerer;
      this.markClueCleared();
      this.resetClueState();
      this.advanceAfterClue();
    } else {
      this.lockedOut.add(this.answerer);
      this.buzzedIn = null;
      this.currentAnswerText = null;

      if (isDD || this.lockedOut.size >= this.contestantIds.length) {
        // Either the DD's single chance is spent or everyone has tried.
        // Show the correct response on a clue_closed screen.
        this.markClueCleared();
        this.phase = 'clue_closed';
        this.buzzersArmed = false;
        this.clearBuzzTimer();
        this.clearAnswerTimer();
      } else {
        // Reopen the buzzer for remaining contestants.
        this.answerer = null;
        this.phase = 'buzz_open';
        this.buzzersArmed = true;
        this.clearBuzzTimer();
        const window = this.opts.buzzWindowMs ?? BUZZ_WINDOW_MS;
        this.buzzTimer = setTimeout(() => this.handleBuzzTimeout(), window);
      }
    }
    this.onChange();
  }

  private markClueCleared(): void {
    if (!this.currentClue || !this.currentClueRound) return;
    this.cleared.add(
      clueKey(this.currentClueRound, this.currentClue.category, this.currentClue.value)
    );
  }

  private resetClueState(): void {
    this.currentClue = null;
    this.currentClueRound = null;
    this.lockedOut.clear();
    this.buzzedIn = null;
    this.answerer = null;
    this.currentAnswerText = null;
    this.ddPlayer = null;
    this.ddWager = null;
    this.buzzersArmed = false;
    this.clearBuzzTimer();
    this.clearAnswerTimer();
  }

  private advanceAfterClue(): void {
    const cluesThisRound = this.currentRoundClues();
    const allCleared = cluesThisRound.every((c) =>
      this.cleared.has(clueKey(this.round, c.category, c.value))
    );
    this.phase = allCleared ? 'between_rounds' : 'show_board';
  }

  nextClue(hostId: string, currentHostId: string): void {
    if (hostId !== currentHostId) throw new Error('Only the host can advance');
    this.requirePhase('clue_closed');
    this.resetClueState();
    this.advanceAfterClue();
    this.onChange();
  }

  startNextRound(hostId: string, currentHostId: string): void {
    if (hostId !== currentHostId) throw new Error('Only the host can start the next round');
    this.requirePhase('between_rounds');
    if (this.round === 1) {
      this.round = 2;
      this.phase = 'show_board';
    } else if (this.round === 2) {
      this.startFinalJeopardy();
    } else {
      throw new Error('No further rounds');
    }
    this.onChange();
  }

  private startFinalJeopardy(): void {
    this.round = 3;
    this.fjEligible = this.contestantIds.filter((id) => (this.scores.get(id) ?? 0) > 0);
    this.fjWagers = new Map();
    this.fjAnswers = new Map();
    this.fjReveals = [];
    this.fjRevealOrder = [];
    this.fjPendingJudge = null;
    if (this.fjEligible.length === 0) {
      // Nobody can play; jump to game over.
      this.endGame();
    } else {
      this.phase = 'fj_category';
    }
  }

  // For FJ wagering and answering:
  submitWager(playerId: string, amount: number): void {
    if (this.phase === 'daily_double_wager') {
      if (playerId !== this.ddPlayer) throw new Error('Only the picker can wager on a Daily Double');
      const score = this.scores.get(playerId) ?? 0;
      if (!isValidDDWager(amount, score, this.currentValueTiers())) {
        throw new Error('Wager out of bounds');
      }
      this.ddWager = amount;
      this.answerer = playerId;
      this.currentAnswerText = null;
      this.phase = 'clue_reading';
      this.onChange();
      return;
    }
    if (this.phase === 'fj_category' || this.phase === 'fj_wager') {
      if (!this.fjEligible.includes(playerId)) throw new Error('Not eligible for Final Jeopardy');
      if (this.fjWagers.has(playerId)) throw new Error('Wager already submitted');
      const score = this.scores.get(playerId) ?? 0;
      if (!isValidFJWager(amount, score)) throw new Error('Wager out of bounds');
      this.fjWagers.set(playerId, amount);
      this.phase = 'fj_wager';
      if (this.allFJWagersIn()) this.advanceFJToClue();
      this.onChange();
      return;
    }
    throw new Error(`Cannot submit a wager in phase "${this.phase}"`);
  }

  // For DD: after the picker has wagered, the host arms (technically reads) the clue;
  // we collapse "armBuzzers" + "answer" into one — picker enters answering phase directly.
  // The host action is `arm_buzzers`, but for a DD it transitions straight into ANSWERING.
  armBuzzersDDAware(hostId: string, currentHostId: string): void {
    if (hostId !== currentHostId) throw new Error('Only the host can read the clue');
    if (this.phase !== 'clue_reading') throw new Error(`Cannot arm in phase "${this.phase}"`);
    if (!this.currentClue) throw new Error('No clue');

    if (this.currentClue.isDailyDouble) {
      // Skip buzzing; picker answers directly.
      this.answerer = this.ddPlayer;
      this.phase = 'answering';
      this.currentAnswerText = null;
      this.clearAnswerTimer();
      this.answerTimer = setTimeout(
        () => this.handleAnswerTimeout(),
        this.opts.answerWindowMs ?? ANSWER_WINDOW_MS
      );
      this.onChange();
      return;
    }
    this.armBuzzers(hostId, currentHostId);
  }

  private allFJWagersIn(): boolean {
    return this.fjEligible.every((id) => this.fjWagers.has(id));
  }

  private allFJAnswersIn(): boolean {
    return this.fjEligible.every((id) => this.fjAnswers.has(id));
  }

  private advanceFJToClue(): void {
    this.phase = 'fj_clue';
    this.clearFJAnswerTimer();
    this.fjAnswerTimer = setTimeout(
      () => this.handleFJAnswerTimeout(),
      this.opts.fjAnswerWindowMs ?? FJ_ANSWER_WINDOW_MS
    );
  }

  private advanceFJToReveal(): void {
    this.clearFJAnswerTimer();
    // Default any missing answers to empty string.
    for (const id of this.fjEligible) {
      if (!this.fjAnswers.has(id)) this.fjAnswers.set(id, '');
      if (!this.fjWagers.has(id)) this.fjWagers.set(id, 0);
    }
    const scoresObj = Object.fromEntries(this.scores);
    this.fjRevealOrder = ascendingScoreOrder(scoresObj, this.fjEligible);
    this.fjPendingJudge = null;
    this.phase = 'fj_reveal';
  }

  revealNextFinal(hostId: string, currentHostId: string): void {
    if (hostId !== currentHostId) throw new Error('Only the host can advance reveals');
    this.requirePhase('fj_reveal');
    if (this.fjPendingJudge) throw new Error('Judge the current contestant first');
    if (this.fjReveals.length >= this.fjRevealOrder.length) {
      this.endGame();
      this.onChange();
      return;
    }
    const next = this.fjRevealOrder[this.fjReveals.length];
    this.fjPendingJudge = {
      playerId: next,
      wager: this.fjWagers.get(next) ?? 0,
      answer: this.fjAnswers.get(next) ?? '',
    };
    this.onChange();
  }

  judgeFinal(hostId: string, currentHostId: string, correct: boolean): void {
    if (hostId !== currentHostId) throw new Error('Only the host can judge');
    this.requirePhase('fj_reveal');
    if (!this.fjPendingJudge) throw new Error('No reveal pending');
    const { playerId, wager, answer } = this.fjPendingJudge;
    const delta = correct ? wager : -wager;
    this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + delta);
    this.fjReveals.push({ playerId, wager, answer, correct });
    this.fjPendingJudge = null;
    if (this.fjReveals.length >= this.fjRevealOrder.length) {
      this.endGame();
    }
    this.onChange();
  }

  private endGame(): void {
    this.phase = 'game_over';
    let bestScore = -Infinity;
    let bestId: string | null = null;
    for (const id of this.contestantIds) {
      const s = this.scores.get(id) ?? 0;
      if (s > bestScore) {
        bestScore = s;
        bestId = id;
      }
    }
    this.winner = bestId;
  }

  // ----- Timer handlers -----

  private handleBuzzTimeout(): void {
    if (this.phase !== 'buzz_open') return;
    this.markClueCleared();
    this.phase = 'clue_closed';
    this.buzzersArmed = false;
    this.clearBuzzTimer();
    this.onChange();
  }

  private handleAnswerTimeout(): void {
    if (this.phase !== 'answering') return;
    this.currentAnswerText = '';
    this.phase = 'judging';
    this.onChange();
  }

  private handleFJAnswerTimeout(): void {
    if (this.phase !== 'fj_clue') return;
    this.advanceFJToReveal();
    this.onChange();
  }

  // ----- Views -----

  private roundView(): RoundView {
    const r = this.episode.round1;
    const r2 = this.episode.round2;
    return {
      number: 1,
      categories: r.categories,
      valueTiers: [...new Set(r.clues.map((c) => c.value))].sort((a, b) => a - b),
    };
  }

  toPublicState(): PublicGameState {
    const r1: RoundView = {
      number: 1,
      categories: this.episode.round1.categories,
      valueTiers: [...new Set(this.episode.round1.clues.map((c) => c.value))].sort(
        (a, b) => a - b
      ),
    };
    const r2: RoundView = {
      number: 2,
      categories: this.episode.round2.categories,
      valueTiers: [...new Set(this.episode.round2.clues.map((c) => c.value))].sort(
        (a, b) => a - b
      ),
    };

    const cleared = [...this.cleared].map((k) => {
      const [round, category, value] = k.split('|');
      return { round: Number(round), category, value: Number(value) };
    });

    let currentClue = null;
    if (this.currentClue && this.currentClueRound) {
      const showResponse =
        this.phase === 'clue_closed' || this.phase === 'game_over' || this.phase === 'between_rounds';
      currentClue = {
        round: this.currentClueRound,
        category: this.currentClue.category,
        value: this.currentClue.value,
        isDailyDouble: this.currentClue.isDailyDouble,
        clueText: this.currentClue.clueText,
        correctResponse: showResponse ? this.currentClue.correctResponse : null,
      };
    }

    const finalRevealed = this.phase === 'game_over' || this.phase === 'fj_reveal';

    return {
      round: this.round,
      scores: Object.fromEntries(this.scores),
      currentPicker: this.currentPicker,
      cleared,
      round1: r1,
      round2: r2,
      currentClue,
      buzzersArmed: this.buzzersArmed,
      buzzedIn: this.buzzedIn,
      lockedOut: [...this.lockedOut],
      ddWager: this.ddWager,
      ddPlayer: this.ddPlayer,
      finalCategory: this.round === 3 ? this.episode.final.category : null,
      finalClueText:
        this.round === 3 && (this.phase === 'fj_clue' || this.phase === 'fj_answer' || finalRevealed)
          ? this.episode.final.clueText
          : null,
      finalCorrectResponse: finalRevealed ? this.episode.final.correctResponse : null,
      fjEligible: this.fjEligible,
      fjWagersSubmitted: [...this.fjWagers.keys()],
      fjAnswersSubmitted: [...this.fjAnswers.keys()],
      fjReveals: [...this.fjReveals],
      fjPending: this.fjPendingJudge,
      winner: this.winner,
    };
  }

  toHostExtras(): HostExtras {
    return {
      currentClueResponse: this.currentClue?.correctResponse ?? null,
      currentBuzzedAnswerText: this.currentAnswerText,
      ddWagerSubmitted: this.ddWager !== null,
      fjWagers: Object.fromEntries(this.fjWagers),
      fjAnswers: Object.fromEntries(this.fjAnswers),
    };
  }
}
