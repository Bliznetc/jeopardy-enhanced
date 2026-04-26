#!/bin/sh
# Downloads the J! Archive Jeopardy clue dataset (~77 MB) into ./data/.
# Idempotent: skips download if the file already exists.

set -e

cd "$(dirname "$0")/.."

DATA_DIR=data
FILE="$DATA_DIR/combined_season1-41.tsv"
URL=https://raw.githubusercontent.com/jwolle1/jeopardy_clue_dataset/master/combined_season1-41.tsv

mkdir -p "$DATA_DIR"

if [ -f "$FILE" ]; then
  echo "$FILE already exists ($(wc -c < "$FILE") bytes). Delete it to re-download."
  exit 0
fi

echo "Downloading dataset to $FILE ..."
curl -L --fail --progress-bar -o "$FILE.tmp" "$URL"
mv "$FILE.tmp" "$FILE"
echo "Done. $(wc -c < "$FILE") bytes."
