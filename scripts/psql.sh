#!/bin/sh
# Opens a psql shell against the running Jeopardy DB container.
# Uses the psql inside the container, so no local Postgres install is required.
#
# Examples:
#   ./scripts/psql.sh                              # interactive shell
#   ./scripts/psql.sh -c "SELECT COUNT(*) FROM clues"
#   ./scripts/psql.sh -f some_query.sql

set -e

cd "$(dirname "$0")/.."

if ! docker compose ps --status running --services | grep -q '^db$'; then
  echo "The 'db' service is not running. Start it with:"
  echo "  docker compose up -d"
  exit 1
fi

exec docker compose exec db psql -U jeopardy -d jeopardy "$@"
