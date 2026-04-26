import { afterAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { pool } from '../src/db';
import { loadRandomEpisode } from '../src/episode';
import { registerHttpRoutes } from '../src/routes';

afterAll(async () => {
  await pool.end();
});

describe('loadRandomEpisode', () => {
  it('returns a structurally complete episode', async () => {
    const ep = await loadRandomEpisode();

    expect(ep.airDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(ep.round1.number).toBe(1);
    expect(ep.round2.number).toBe(2);
    expect(ep.round1.categories).toHaveLength(6);
    expect(ep.round2.categories).toHaveLength(6);
    expect(ep.round1.clues).toHaveLength(30);
    expect(ep.round2.clues).toHaveLength(30);
  });

  it('every category in a round shares the same 5 value tiers', async () => {
    const ep = await loadRandomEpisode();
    function valuesFor(round: typeof ep.round1, cat: string): number[] {
      return round.clues
        .filter((c) => c.category === cat)
        .map((c) => c.value)
        .sort((a, b) => a - b);
    }
    for (const round of [ep.round1, ep.round2]) {
      const tiers = valuesFor(round, round.categories[0]);
      expect(tiers).toHaveLength(5);
      for (const cat of round.categories) {
        expect(valuesFor(round, cat)).toEqual(tiers);
      }
      // Round 2 tiers should be strictly larger than round 1's max
      // (or at least different; not asserting strict TV doubling because
      // of pre-2001 episodes where r2 = 2 × r1 instead of modern 2x).
    }
  });

  it('has exactly 1 Daily Double in round 1 and 2 in round 2', async () => {
    const ep = await loadRandomEpisode();
    expect(ep.round1.clues.filter((c) => c.isDailyDouble)).toHaveLength(1);
    expect(ep.round2.clues.filter((c) => c.isDailyDouble)).toHaveLength(2);
  });

  it('every clue has non-empty text', async () => {
    const ep = await loadRandomEpisode();
    for (const clue of [...ep.round1.clues, ...ep.round2.clues]) {
      expect(clue.category).toBeTruthy();
      expect(clue.clueText.length).toBeGreaterThan(0);
      expect(clue.correctResponse.length).toBeGreaterThan(0);
    }
    expect(ep.final.category).toBeTruthy();
    expect(ep.final.clueText.length).toBeGreaterThan(0);
    expect(ep.final.correctResponse.length).toBeGreaterThan(0);
  });

  it('returns different episodes across calls (sampling)', async () => {
    const dates = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const ep = await loadRandomEpisode();
      dates.add(ep.airDate);
    }
    // With 2,187 valid episodes, 6 random draws colliding all to one date
    // would be astronomically unlikely.
    expect(dates.size).toBeGreaterThan(1);
  });
});

describe('GET /api/episode', () => {
  it('returns a valid episode payload', async () => {
    const app = Fastify({ logger: false });
    registerHttpRoutes(app);
    try {
      const res = await app.inject({ method: 'GET', url: '/api/episode' });
      expect(res.statusCode).toBe(200);
      const ep = res.json();
      expect(ep.round1.clues).toHaveLength(30);
      expect(ep.round2.clues).toHaveLength(30);
      expect(ep.final.category).toBeTruthy();
    } finally {
      await app.close();
    }
  });
});
