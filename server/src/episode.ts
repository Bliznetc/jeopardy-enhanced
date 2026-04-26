import { pool } from './db';
import type {
  BoardClue,
  Episode,
  FinalJeopardy,
  Round,
} from '../../shared/protocol';

interface ClueRow {
  round: number;
  clue_value: number | null;
  daily_double_value: number | null;
  category: string;
  answer: string;
  question: string;
  air_date: string;
}

// Episodes used by the game must have:
//  - 30 clues in round 1, 30 in round 2, 1 in final
//  - exactly 6 distinct categories per round
//  - exactly 5 distinct clue values per round (the value tiers)
//  - exactly 1 Daily Double in round 1, exactly 2 in round 2
// Daily Doubles are encoded with daily_double_value > 0 (non-DDs use 0).
const PICK_AIR_DATE_SQL = `
  WITH eligible AS (
    SELECT air_date,
           COUNT(*) FILTER (WHERE round = 1)                              AS r1,
           COUNT(*) FILTER (WHERE round = 2)                              AS r2,
           COUNT(*) FILTER (WHERE round = 3)                              AS r3,
           COUNT(*) FILTER (WHERE round = 1 AND daily_double_value > 0)   AS dd1,
           COUNT(*) FILTER (WHERE round = 2 AND daily_double_value > 0)   AS dd2,
           COUNT(DISTINCT category)   FILTER (WHERE round = 1)            AS cats1,
           COUNT(DISTINCT category)   FILTER (WHERE round = 2)            AS cats2,
           COUNT(DISTINCT clue_value) FILTER (WHERE round = 1 AND clue_value IS NOT NULL) AS vals1,
           COUNT(DISTINCT clue_value) FILTER (WHERE round = 2 AND clue_value IS NOT NULL) AS vals2
    FROM clues
    WHERE air_date IS NOT NULL
    GROUP BY air_date
  )
  SELECT air_date::text AS air_date FROM eligible
  WHERE r1 = 30 AND r2 = 30 AND r3 = 1
    AND dd1 = 1 AND dd2 = 2
    AND cats1 = 6 AND cats2 = 6
    AND vals1 = 5 AND vals2 = 5
  ORDER BY random() LIMIT 1;
`;

const FETCH_BY_DATE_SQL = `
  SELECT round, clue_value, daily_double_value, category, answer, question,
         air_date::text AS air_date
  FROM clues
  WHERE air_date = $1
  ORDER BY round, category, clue_value;
`;

export async function loadRandomEpisode(): Promise<Episode> {
  const pick = await pool.query<{ air_date: string }>(PICK_AIR_DATE_SQL);
  if (pick.rowCount === 0) {
    throw new Error('No eligible episodes in database');
  }
  return loadEpisodeByDate(pick.rows[0].air_date);
}

export async function loadEpisodeByDate(airDate: string): Promise<Episode> {
  const result = await pool.query<ClueRow>(FETCH_BY_DATE_SQL, [airDate]);
  const rows = result.rows;
  if (rows.length === 0) {
    throw new Error(`No clues found for air_date ${airDate}`);
  }

  const round1Rows = rows.filter((r) => r.round === 1);
  const round2Rows = rows.filter((r) => r.round === 2);
  const finalRows = rows.filter((r) => r.round === 3);

  if (round1Rows.length !== 30) throw new Error(`Round 1 has ${round1Rows.length} clues, expected 30`);
  if (round2Rows.length !== 30) throw new Error(`Round 2 has ${round2Rows.length} clues, expected 30`);
  if (finalRows.length !== 1) throw new Error(`Final has ${finalRows.length} clues, expected 1`);

  const final: FinalJeopardy = {
    category: finalRows[0].category,
    clueText: finalRows[0].answer,
    correctResponse: finalRows[0].question,
  };

  return {
    airDate: rows[0].air_date,
    round1: buildRound(1, round1Rows),
    round2: buildRound(2, round2Rows),
    final,
  };
}

function isDailyDouble(row: ClueRow): boolean {
  return (row.daily_double_value ?? 0) > 0;
}

function buildRound(num: 1 | 2, rows: ClueRow[]): Round {
  // Discover this round's 5 value tiers from the data (varies by era).
  const valueTiers = [
    ...new Set(
      rows
        .map((r) => r.clue_value)
        .filter((v): v is number => v !== null)
    ),
  ].sort((a, b) => a - b);

  if (valueTiers.length !== 5) {
    throw new Error(`Round ${num} has ${valueTiers.length} value tiers, expected 5`);
  }

  // Group clues by category, preserving first-seen order from the SQL ordering.
  const byCategory = new Map<string, ClueRow[]>();
  for (const r of rows) {
    const list = byCategory.get(r.category);
    if (list) {
      list.push(r);
    } else {
      byCategory.set(r.category, [r]);
    }
  }

  if (byCategory.size !== 6) {
    throw new Error(`Round ${num} has ${byCategory.size} categories, expected 6`);
  }

  const categories = [...byCategory.keys()];
  const clues: BoardClue[] = [];

  for (const category of categories) {
    const catRows = byCategory.get(category)!;
    if (catRows.length !== 5) {
      throw new Error(`Category "${category}" has ${catRows.length} clues, expected 5`);
    }

    for (const tier of valueTiers) {
      const row = catRows.find((r) => r.clue_value === tier);
      if (!row) {
        throw new Error(`Missing clue for category "${category}" at value ${tier}`);
      }
      clues.push({
        category,
        value: tier,
        isDailyDouble: isDailyDouble(row),
        clueText: row.answer,
        correctResponse: row.question,
      });
    }
  }

  const ddCount = clues.filter((c) => c.isDailyDouble).length;
  const requiredDDs = num === 1 ? 1 : 2;
  if (ddCount !== requiredDDs) {
    throw new Error(`Round ${num} has ${ddCount} Daily Doubles, expected ${requiredDDs}`);
  }

  return { number: num, categories, clues };
}
