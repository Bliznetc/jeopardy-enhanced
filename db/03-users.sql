-- User accounts for login/registration and persistent identity.
-- This runs only on a fresh Postgres volume (docker-entrypoint-initdb.d).
-- The server also runs an idempotent CREATE TABLE IF NOT EXISTS on boot
-- (see server/src/auth/schema.ts), so existing volumes self-migrate too.

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
