import type { BoardClue, Episode, Round } from '../../shared/protocol';

export function makeRound(num: 1 | 2): Round {
  const tiers = num === 1 ? [200, 400, 600, 800, 1000] : [400, 800, 1200, 1600, 2000];
  const categories = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON', 'ZETA'];
  const clues: BoardClue[] = [];
  for (const cat of categories) {
    for (const tier of tiers) {
      clues.push({
        category: cat,
        value: tier,
        isDailyDouble: false,
        clueText: `R${num} ${cat} $${tier} clue`,
        correctResponse: `R${num} ${cat} $${tier} response`,
      });
    }
  }
  return { number: num, categories, clues };
}

// Marks the given (category, value) combos as Daily Doubles.
export function withDailyDoubles(
  round: Round,
  positions: Array<{ category: string; value: number }>
): Round {
  const clues = round.clues.map((c) =>
    positions.some((p) => p.category === c.category && p.value === c.value)
      ? { ...c, isDailyDouble: true }
      : c
  );
  return { ...round, clues };
}

export function makeFixtureEpisode(): Episode {
  const r1 = withDailyDoubles(makeRound(1), [{ category: 'ALPHA', value: 600 }]);
  const r2 = withDailyDoubles(makeRound(2), [
    { category: 'ALPHA', value: 800 },
    { category: 'GAMMA', value: 1600 },
  ]);
  return {
    airDate: '2024-01-01',
    round1: r1,
    round2: r2,
    final: {
      category: 'FINALE',
      clueText: 'The final clue text',
      correctResponse: 'the final response',
    },
  };
}
