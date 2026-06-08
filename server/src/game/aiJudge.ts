import { fuzzyJudge } from './scoring';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const TIMEOUT_MS = Number(process.env.AI_JUDGE_TIMEOUT_MS ?? 4000);

export interface JudgeInput {
  clueText: string;
  correctResponse: string;
  submitted: string;
}

// Returns true/false. Never throws: any failure path falls back to fuzzyJudge.
export async function judgeAnswer(input: JudgeInput): Promise<boolean> {
  const submitted = input.submitted.trim();
  if (!submitted) return false; // empty/timeout answer is always wrong, no API call

  const key = process.env.OPENAI_API_KEY;
  if (!key) return fuzzyJudge(submitted, input.correctResponse);

  try {
    const verdict = await callOpenAI(key, input);
    return verdict ?? fuzzyJudge(submitted, input.correctResponse);
  } catch {
    return fuzzyJudge(submitted, input.correctResponse);
  }
}

async function callOpenAI(key: string, input: JudgeInput): Promise<boolean | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a strict but fair Jeopardy! judge. Decide whether the ' +
              "contestant's response is acceptable for the official correct " +
              'response. Accept differences in phrasing, the "what is"/"who is" ' +
              'prefix, minor spelling/typos, and partial names when unambiguous. ' +
              'Reject answers that name the wrong entity. Respond ONLY as JSON: ' +
              '{"correct": true|false}.',
          },
          {
            role: 'user',
            content:
              `Clue: ${input.clueText}\n` +
              `Official correct response: ${input.correctResponse}\n` +
              `Contestant response: ${input.submitted}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { correct?: unknown };
    return typeof parsed.correct === 'boolean' ? parsed.correct : null;
  } finally {
    clearTimeout(timer);
  }
}
