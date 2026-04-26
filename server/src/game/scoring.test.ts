import { describe, it, expect } from 'vitest';
import {
  ddWagerBounds,
  isValidDDWager,
  fjWagerMax,
  isValidFJWager,
  ascendingScoreOrder,
  chooseInitialPicker,
  clueKey,
} from './scoring';

describe('Daily Double wager bounds', () => {
  it('uses the round max when score is low', () => {
    expect(ddWagerBounds(0, [200, 400, 600, 800, 1000])).toEqual({ min: 5, max: 1000 });
    expect(ddWagerBounds(500, [400, 800, 1200, 1600, 2000])).toEqual({ min: 5, max: 2000 });
  });

  it('uses the score when score is higher than the round max', () => {
    expect(ddWagerBounds(5000, [200, 400, 600, 800, 1000])).toEqual({ min: 5, max: 5000 });
  });

  it('still allows the $5 minimum on a negative score', () => {
    expect(ddWagerBounds(-200, [200, 400, 600, 800, 1000])).toEqual({ min: 5, max: 1000 });
  });
});

describe('isValidDDWager', () => {
  it('accepts wagers within bounds', () => {
    expect(isValidDDWager(5, 0, [200, 400, 600, 800, 1000])).toBe(true);
    expect(isValidDDWager(1000, 0, [200, 400, 600, 800, 1000])).toBe(true);
    expect(isValidDDWager(2500, 2500, [200, 400, 600, 800, 1000])).toBe(true);
  });
  it('rejects non-integer wagers', () => {
    expect(isValidDDWager(100.5, 1000, [200, 400, 600, 800, 1000])).toBe(false);
  });
  it('rejects below-minimum wagers', () => {
    expect(isValidDDWager(0, 1000, [200, 400, 600, 800, 1000])).toBe(false);
    expect(isValidDDWager(4, 1000, [200, 400, 600, 800, 1000])).toBe(false);
  });
  it('rejects over-maximum wagers', () => {
    expect(isValidDDWager(1001, 0, [200, 400, 600, 800, 1000])).toBe(false);
    expect(isValidDDWager(2501, 2500, [200, 400, 600, 800, 1000])).toBe(false);
  });
});

describe('Final Jeopardy wager rules', () => {
  it('caps at the player score', () => {
    expect(fjWagerMax(2400)).toBe(2400);
    expect(fjWagerMax(0)).toBe(0);
  });
  it('treats negative scores as zero (player is ineligible)', () => {
    expect(fjWagerMax(-500)).toBe(0);
  });
  it('isValidFJWager allows 0 through the score', () => {
    expect(isValidFJWager(0, 1000)).toBe(true);
    expect(isValidFJWager(1000, 1000)).toBe(true);
    expect(isValidFJWager(-1, 1000)).toBe(false);
    expect(isValidFJWager(1001, 1000)).toBe(false);
  });
});

describe('ascendingScoreOrder', () => {
  it('sorts ascending and breaks ties by id', () => {
    const scores = { alice: 1000, bob: 500, carol: 1000 };
    expect(ascendingScoreOrder(scores, ['alice', 'bob', 'carol'])).toEqual([
      'bob',
      'alice',
      'carol',
    ]);
  });
  it('only includes players in amongIds', () => {
    const scores = { alice: 1000, bob: 500, carol: 200 };
    expect(ascendingScoreOrder(scores, ['alice', 'carol'])).toEqual(['carol', 'alice']);
  });
});

describe('chooseInitialPicker', () => {
  it('returns one of the contestants', () => {
    const ids = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) {
      expect(ids).toContain(chooseInitialPicker(ids));
    }
  });
  it('throws on empty list', () => {
    expect(() => chooseInitialPicker([])).toThrow();
  });
});

describe('clueKey', () => {
  it('produces stable keys', () => {
    expect(clueKey(1, 'HISTORY', 200)).toBe('1|HISTORY|200');
    expect(clueKey(1, 'HISTORY', 200)).toBe(clueKey(1, 'HISTORY', 200));
  });
});
