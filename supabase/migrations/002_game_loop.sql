-- supabase/migrations/002_game_loop.sql

CREATE TABLE rounds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid REFERENCES sessions(id) ON DELETE CASCADE,
  question_id  uuid REFERENCES questions(id),
  round_number integer NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed'))
);

CREATE TABLE answers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id     uuid REFERENCES rounds(id) ON DELETE CASCADE,
  player_id    uuid REFERENCES players(id) ON DELETE CASCADE,
  value        integer NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, player_id)
);

CREATE INDEX idx_rounds_session_id ON rounds(session_id);
CREATE INDEX idx_answers_round_id ON answers(round_id);
