import pg from 'pg';

const DEFAULT_URL = 'postgresql://jeopardy:jeopardy@localhost:5432/jeopardy';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? DEFAULT_URL,
  max: 10,
});

pool.on('error', (err) => {
  console.error('Unexpected pg pool error', err);
});
