# Jeopardy DB

Local Postgres preloaded with ~530k Jeopardy! clues from the
[jwolle1/jeopardy_clue_dataset](https://github.com/jwolle1/jeopardy_clue_dataset)
(Seasons 1–41, 1984–2025).

## Setup

Requires Docker and `curl`.

```sh
./scripts/download-dataset.sh   # ~77 MB → ./data/ (gitignored)
docker compose up -d            # Postgres on localhost:5432
```

First boot takes ~10–30 s while the TSV loads. Watch with `docker compose logs -f db`.

## Query

```sh
./scripts/psql.sh                                 # interactive shell
./scripts/psql.sh -c "SELECT COUNT(*) FROM clues" # one-off query
./scripts/psql.sh -f some_query.sql               # run a file
```

Or connect from any client: `postgresql://jeopardy:jeopardy@localhost:5432/jeopardy`.

## Reset

The init scripts only run on a fresh volume. To reload:

```sh
docker compose down -v && docker compose up -d
```

## Schema

One table, `clues`:

| column                                       | notes                                       |
|----------------------------------------------|---------------------------------------------|
| `id`                                         | bigserial PK                                |
| `round`                                      | 1=Single, 2=Double, 3=Final                 |
| `clue_value`, `daily_double_value`           | int, nullable                               |
| `category`, `comments`, `notes`              | text                                        |
| `answer`                                     | the clue shown to contestants               |
| `question`                                   | the response contestants must give          |
| `air_date`                                   | date                                        |

Indexes on `round`, `category`, `air_date`.
