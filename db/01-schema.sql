-- Schema for the J! Archive clue dataset (jwolle1/jeopardy_clue_dataset).
-- Column order matches the source TSV header so \copy can stream it in.

CREATE TABLE clues (
    id                  BIGSERIAL PRIMARY KEY,
    round               SMALLINT NOT NULL,   -- 1=Single, 2=Double, 3=Final, 4=Tiebreaker (extra_matches only)
    clue_value          INT,                  -- NULL for Final/Tiebreaker
    daily_double_value  INT,                  -- NULL unless Daily Double
    category            TEXT NOT NULL,
    comments            TEXT,                 -- host's pre-category remarks
    answer              TEXT NOT NULL,        -- the clue shown to contestants
    question            TEXT NOT NULL,        -- the response contestants must give
    air_date            DATE,
    notes               TEXT
);

CREATE INDEX clues_round_idx    ON clues (round);
CREATE INDEX clues_category_idx ON clues (category);
CREATE INDEX clues_air_date_idx ON clues (air_date);
