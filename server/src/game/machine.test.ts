import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Game } from './machine';
import { makeFixtureEpisode } from '../../test/fixtures';

const CONTESTANTS = [{ id: 'alice' }, { id: 'bob' }, { id: 'carol' }];

function newGame(opts?: { picker?: string }): Game {
  let changes = 0;
  const game = new Game(
    makeFixtureEpisode(),
    CONTESTANTS,
    () => {
      changes++;
    },
    {
      buzzWindowMs: 50,
      answerWindowMs: 50,
      fjAnswerWindowMs: 50,
      pickerOverride: opts?.picker ?? 'alice',
    }
  );
  return game;
}

describe('Game initialization', () => {
  it('starts in show_board with picker set and zero scores', () => {
    const g = newGame();
    expect(g.phase).toBe('show_board');
    expect(g.round).toBe(1);
    expect(g.currentPicker).toBe('alice');
    expect(g.scores.get('alice')).toBe(0);
    expect(g.scores.get('bob')).toBe(0);
    expect(g.scores.get('carol')).toBe(0);
  });
});

describe('basic clue flow', () => {
  let g: Game;
  beforeEach(() => {
    g = newGame();
  });
  afterEach(() => g.cleanup());

  it('picker → arm → buzz → answer → correct: score up, picker rotates', () => {
    g.pickClue('alice', 1, 'BETA', 400);
    expect(g.phase).toBe('clue_reading');
    expect(g.currentClue?.category).toBe('BETA');

    g.armBuzzersDDAware('host', 'host');
    expect(g.phase).toBe('buzz_open');
    expect(g.buzzersArmed).toBe(true);

    g.buzz('bob');
    expect(g.phase).toBe('answering');
    expect(g.buzzedIn).toBe('bob');

    g.submitAnswer('bob', 'his answer');
    expect(g.phase).toBe('judging');

    g.judge('host', 'host', true);
    expect(g.scores.get('bob')).toBe(400);
    expect(g.currentPicker).toBe('bob');
    expect(g.phase).toBe('show_board');
  });

  it('wrong answer locks the player out and reopens buzzer', () => {
    g.pickClue('alice', 1, 'BETA', 400);
    g.armBuzzersDDAware('host', 'host');
    g.buzz('bob');
    g.submitAnswer('bob', 'wrong');
    g.judge('host', 'host', false);
    expect(g.scores.get('bob')).toBe(-400);
    expect(g.lockedOut.has('bob')).toBe(true);
    expect(g.phase).toBe('buzz_open');

    // Bob is locked out — server rejects
    expect(() => g.buzz('bob')).toThrow();

    // Carol takes a shot, gets it right
    g.buzz('carol');
    g.submitAnswer('carol', 'right');
    g.judge('host', 'host', true);
    expect(g.scores.get('carol')).toBe(400);
    expect(g.currentPicker).toBe('carol');
  });

  it('all contestants wrong closes the clue', () => {
    g.pickClue('alice', 1, 'BETA', 400);
    g.armBuzzersDDAware('host', 'host');
    for (const id of ['alice', 'bob', 'carol']) {
      g.buzz(id);
      g.submitAnswer(id, 'wrong');
      g.judge('host', 'host', false);
    }
    expect(g.phase).toBe('clue_closed');
    expect(g.currentPicker).toBe('alice'); // unchanged
    g.nextClue('host', 'host');
    expect(g.phase).toBe('show_board');
  });

  it('buzz timeout (no one buzzes) closes the clue', async () => {
    g.pickClue('alice', 1, 'BETA', 400);
    g.armBuzzersDDAware('host', 'host');
    await new Promise((r) => setTimeout(r, 80)); // > buzzWindowMs (50)
    expect(g.phase).toBe('clue_closed');
    expect(g.currentPicker).toBe('alice'); // picker unchanged
  });

  it('answer timeout marks judging with empty text', async () => {
    g.pickClue('alice', 1, 'BETA', 400);
    g.armBuzzersDDAware('host', 'host');
    g.buzz('bob');
    await new Promise((r) => setTimeout(r, 80));
    expect(g.phase).toBe('judging');
    expect(g.currentAnswerText).toBe('');
    g.judge('host', 'host', false);
    expect(g.scores.get('bob')).toBe(-400);
  });

  it('rejects picks from the wrong player', () => {
    expect(() => g.pickClue('bob', 1, 'BETA', 400)).toThrow(/picker/);
  });

  it('rejects picks of a cleared clue', () => {
    g.pickClue('alice', 1, 'BETA', 400);
    g.armBuzzersDDAware('host', 'host');
    g.buzz('bob');
    g.submitAnswer('bob', 'x');
    g.judge('host', 'host', true);
    // bob is now picker
    expect(() => g.pickClue('bob', 1, 'BETA', 400)).toThrow(/already used/);
  });
});

describe('Daily Double', () => {
  let g: Game;
  beforeEach(() => {
    g = newGame();
  });
  afterEach(() => g.cleanup());

  it('picker wagers, answers, and is judged — picker unchanged after correct', () => {
    g.pickClue('alice', 1, 'ALPHA', 600); // fixture's R1 DD
    expect(g.phase).toBe('daily_double_wager');

    g.submitWager('alice', 500);
    expect(g.phase).toBe('clue_reading');

    g.armBuzzersDDAware('host', 'host');
    expect(g.phase).toBe('answering'); // DD skips buzzing
    expect(g.answerer).toBe('alice');

    g.submitAnswer('alice', 'her response');
    g.judge('host', 'host', true);
    expect(g.scores.get('alice')).toBe(500);
    expect(g.currentPicker).toBe('alice'); // unchanged
  });

  it('picker only — non-picker cannot answer DD', () => {
    g.pickClue('alice', 1, 'ALPHA', 600);
    g.submitWager('alice', 500);
    g.armBuzzersDDAware('host', 'host');
    expect(() => g.submitAnswer('bob', 'x')).toThrow(/your turn/);
  });

  it('rejects DD wager from the wrong player', () => {
    g.pickClue('alice', 1, 'ALPHA', 600);
    expect(() => g.submitWager('bob', 500)).toThrow();
  });

  it('rejects out-of-range DD wagers', () => {
    g.pickClue('alice', 1, 'ALPHA', 600);
    expect(() => g.submitWager('alice', 0)).toThrow(/out of bounds/);
    expect(() => g.submitWager('alice', 1001)).toThrow(/out of bounds/);
    g.submitWager('alice', 1000); // round-1 max for our fixture
    expect(g.ddWager).toBe(1000);
  });

  it('losing DD subtracts the wager, shows clue_closed, then back to show_board', () => {
    g.pickClue('alice', 1, 'ALPHA', 600);
    g.submitWager('alice', 800);
    g.armBuzzersDDAware('host', 'host');
    g.submitAnswer('alice', 'wrong');
    g.judge('host', 'host', false);
    expect(g.scores.get('alice')).toBe(-800);
    expect(g.currentPicker).toBe('alice');
    expect(g.phase).toBe('clue_closed');
    g.nextClue('host', 'host');
    expect(g.phase).toBe('show_board');
  });
});

describe('Round transitions', () => {
  it('after all R1 clues used, host advances to R2', () => {
    const g = newGame();
    // Force-clear all R1 clues by mutating Game directly is brittle; instead
    // simulate clearing them through the public API would be 30 round-trips.
    // For this test we manually set state to simulate R1 done.
    for (const c of g.episode.round1.clues) {
      g.cleared.add(`1|${c.category}|${c.value}`);
    }
    g.phase = 'clue_closed';
    g.currentClue = g.episode.round1.clues[0];
    g.currentClueRound = 1;
    g.nextClue('host', 'host');
    expect(g.phase).toBe('between_rounds');
    g.startNextRound('host', 'host');
    expect(g.round).toBe(2);
    expect(g.phase).toBe('show_board');
    g.cleanup();
  });
});

describe('Final Jeopardy', () => {
  function makeGameWithR2Done(scores: Record<string, number>): Game {
    const g = newGame();
    for (const [id, s] of Object.entries(scores)) g.scores.set(id, s);
    for (const c of g.episode.round1.clues) g.cleared.add(`1|${c.category}|${c.value}`);
    for (const c of g.episode.round2.clues) g.cleared.add(`2|${c.category}|${c.value}`);
    g.round = 2;
    g.phase = 'between_rounds';
    g.startNextRound('host', 'host');
    return g;
  }

  it('marks players with positive score as eligible', () => {
    const g = makeGameWithR2Done({ alice: 1500, bob: 0, carol: -200 });
    expect(g.phase).toBe('fj_category');
    expect(g.fjEligible).toEqual(['alice']);
    g.cleanup();
  });

  it('all-ineligible jumps straight to game over', () => {
    const g = makeGameWithR2Done({ alice: -100, bob: 0, carol: -50 });
    expect(g.phase).toBe('game_over');
    g.cleanup();
  });

  it('full FJ flow: wagers → clue → answers → reveal in score order', () => {
    const g = makeGameWithR2Done({ alice: 2000, bob: 1000, carol: 500 });
    expect(g.fjEligible).toEqual(['alice', 'bob', 'carol']);

    g.submitWager('alice', 1500);
    g.submitWager('bob', 500);
    g.submitWager('carol', 100);
    expect(g.phase).toBe('fj_clue');

    g.submitAnswer('alice', 'alice answer');
    g.submitAnswer('bob', 'bob answer');
    g.submitAnswer('carol', 'carol answer');
    expect(g.phase).toBe('fj_reveal');
    expect(g.fjRevealOrder).toEqual(['carol', 'bob', 'alice']);

    g.revealNextFinal('host', 'host');
    expect(g.fjPendingJudge?.playerId).toBe('carol');
    g.judgeFinal('host', 'host', true);
    expect(g.scores.get('carol')).toBe(600);

    g.revealNextFinal('host', 'host');
    g.judgeFinal('host', 'host', false);
    expect(g.scores.get('bob')).toBe(500); // 1000 - 500

    g.revealNextFinal('host', 'host');
    g.judgeFinal('host', 'host', true);
    expect(g.scores.get('alice')).toBe(3500);

    expect(g.phase).toBe('game_over');
    expect(g.winner).toBe('alice');
    g.cleanup();
  });

  it('FJ wager bounds enforced', () => {
    const g = makeGameWithR2Done({ alice: 1000, bob: 500, carol: 200 });
    expect(() => g.submitWager('alice', -1)).toThrow();
    expect(() => g.submitWager('alice', 1001)).toThrow();
    g.submitWager('alice', 1000); // exactly score allowed
    expect(g.fjWagers.get('alice')).toBe(1000);
    g.cleanup();
  });

  it('FJ answer timeout treats missing answers as empty', async () => {
    const g = makeGameWithR2Done({ alice: 1000, bob: 500, carol: 200 });
    g.submitWager('alice', 100);
    g.submitWager('bob', 100);
    g.submitWager('carol', 100);
    expect(g.phase).toBe('fj_clue');
    await new Promise((r) => setTimeout(r, 80));
    expect(g.phase).toBe('fj_reveal');
    expect(g.fjAnswers.get('alice')).toBe('');
    expect(g.fjAnswers.get('bob')).toBe('');
    expect(g.fjAnswers.get('carol')).toBe('');
    g.cleanup();
  });
});

describe('host-only operations', () => {
  it('arm buzzers requires the host id', () => {
    const g = newGame();
    g.pickClue('alice', 1, 'BETA', 400);
    expect(() => g.armBuzzersDDAware('alice', 'host')).toThrow(/host/i);
    g.cleanup();
  });

  it('judge requires the host id', () => {
    const g = newGame();
    g.pickClue('alice', 1, 'BETA', 400);
    g.armBuzzersDDAware('host', 'host');
    g.buzz('bob');
    g.submitAnswer('bob', 'x');
    expect(() => g.judge('alice', 'host', true)).toThrow(/host/i);
    g.cleanup();
  });
});
