import { afterEach, describe, expect, it, vi } from 'vitest';
import { judgeAnswer } from '../src/game/aiJudge';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
});

describe('judgeAnswer', () => {
  it('empty submission is always wrong (no API call)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await judgeAnswer({ clueText: 'x', correctResponse: 'y', submitted: '   ' })).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to fuzzyJudge when no key is set', async () => {
    expect(
      await judgeAnswer({ clueText: 'c', correctResponse: 'Abraham Lincoln', submitted: 'who is lincoln' })
    ).toBe(true);
    expect(
      await judgeAnswer({ clueText: 'c', correctResponse: 'Abraham Lincoln', submitted: 'george washington' })
    ).toBe(false);
  });

  it('uses the API verdict when the key is set', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: '{"correct": true}' } }] }), {
            status: 200,
          })
      )
    );
    expect(await judgeAnswer({ clueText: 'c', correctResponse: 'JFK', submitted: 'John F Kennedy' })).toBe(true);
  });

  it('falls back to fuzzyJudge on API error', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 500 })));
    expect(await judgeAnswer({ clueText: 'c', correctResponse: 'Paris', submitted: 'what is paris' })).toBe(true);
  });
});
