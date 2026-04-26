// Pure scoring helpers. No I/O; easy to unit-test.

const DD_MIN_WAGER = 5;

export function ddWagerBounds(
  score: number,
  valueTiers: number[]
): { min: number; max: number } {
  const max = Math.max(score, Math.max(...valueTiers));
  return { min: DD_MIN_WAGER, max };
}

export function isValidDDWager(
  amount: number,
  score: number,
  valueTiers: number[]
): boolean {
  if (!Number.isInteger(amount)) return false;
  const { min, max } = ddWagerBounds(score, valueTiers);
  return amount >= min && amount <= max;
}

export function fjWagerMax(score: number): number {
  return Math.max(0, score);
}

export function isValidFJWager(amount: number, score: number): boolean {
  if (!Number.isInteger(amount)) return false;
  return amount >= 0 && amount <= fjWagerMax(score);
}

// Sort player ids by ascending score (ties broken by id for stable order).
export function ascendingScoreOrder(
  scores: Record<string, number>,
  amongIds: string[]
): string[] {
  return [...amongIds].sort((a, b) => {
    const sa = scores[a] ?? 0;
    const sb = scores[b] ?? 0;
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b);
  });
}

// Pick a random first picker for round 1.
export function chooseInitialPicker(contestantIds: string[]): string {
  if (contestantIds.length === 0) throw new Error('No contestants');
  return contestantIds[Math.floor(Math.random() * contestantIds.length)];
}

export function clueKey(round: number, category: string, value: number): string {
  return `${round}|${category}|${value}`;
}
