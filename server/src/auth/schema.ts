import { pool } from '../db';

// Idempotent: safe to run on every boot. Works on both fresh and existing volumes
// (the clues DB init scripts only run on a fresh volume, so we self-migrate here).
export async function ensureAuthSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id             BIGSERIAL PRIMARY KEY,
      username       TEXT NOT NULL,
      username_ci    TEXT NOT NULL UNIQUE,
      password_hash  TEXT NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      games_played   INTEGER NOT NULL DEFAULT 0,
      games_won      INTEGER NOT NULL DEFAULT 0,
      total_winnings BIGINT  NOT NULL DEFAULT 0
    );
  `);
}
