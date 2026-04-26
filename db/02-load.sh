#!/bin/sh
# Loads the Jeopardy TSV into the clues table.
# Runs once, automatically, on first container start (via /docker-entrypoint-initdb.d).

set -e

TSV=/data/combined_season1-41.tsv

if [ ! -f "$TSV" ]; then
  echo "ERROR: $TSV not found inside the container."
  echo "       Run ./scripts/download-dataset.sh on the host, then:"
  echo "         docker compose down -v && docker compose up"
  exit 1
fi

echo "Loading $TSV into clues..."

# QUOTE is set to a backspace (a character that does not appear in the data)
# to effectively disable CSV-style quoting, since the source TSV is unquoted.
psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" \
     -c "\copy clues(round, clue_value, daily_double_value, category, comments, answer, question, air_date, notes) FROM '$TSV' WITH (FORMAT csv, DELIMITER E'\t', HEADER true, QUOTE E'\b')"

ROWS=$(psql -tA --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "SELECT COUNT(*) FROM clues;")
echo "Loaded $ROWS clues."
