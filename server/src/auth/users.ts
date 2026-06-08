import { pool } from '../db';
import { hashPassword, verifyPassword } from './passwords';

export interface PublicUser {
  id: number;
  username: string;
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const MIN_PASSWORD = 8;

export function validateCredentials(username: string, password: string): void {
  if (!USERNAME_RE.test(username)) {
    throw new Error('Username must be 3–20 chars: letters, numbers, underscore');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw new Error(`Password must be at least ${MIN_PASSWORD} characters`);
  }
}

export async function createUser(username: string, password: string): Promise<PublicUser> {
  validateCredentials(username, password);
  const hash = await hashPassword(password);
  try {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (username, username_ci, password_hash)
       VALUES ($1, $2, $3) RETURNING id`,
      [username, username.toLowerCase(), hash]
    );
    return { id: Number(r.rows[0].id), username };
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new Error('Username already taken');
    throw e;
  }
}

export async function authenticate(username: string, password: string): Promise<PublicUser> {
  const r = await pool.query<{ id: string; username: string; password_hash: string }>(
    `SELECT id, username, password_hash FROM users WHERE username_ci = $1`,
    [username.toLowerCase()]
  );
  const row = r.rows[0];
  // Always run a hash compare to avoid leaking which usernames exist (timing).
  const ok = row
    ? await verifyPassword(password, row.password_hash)
    : await verifyPassword(password, 'scrypt$00$00');
  if (!row || !ok) throw new Error('Invalid username or password');
  return { id: Number(row.id), username: row.username };
}

export async function recordGameResult(
  results: { userId: number; score: number; won: boolean }[]
): Promise<void> {
  for (const r of results) {
    await pool.query(
      `UPDATE users
         SET games_played = games_played + 1,
             games_won = games_won + $2,
             total_winnings = total_winnings + $3
       WHERE id = $1`,
      [r.userId, r.won ? 1 : 0, Math.max(0, r.score)]
    );
  }
}
