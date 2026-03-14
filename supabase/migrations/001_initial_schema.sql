-- supabase/migrations/001_initial_schema.sql

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code    text UNIQUE NOT NULL,
  host_id      uuid NOT NULL,
  status       text DEFAULT 'lobby' CHECK (status IN ('lobby', 'active', 'finished')),
  category     text DEFAULT 'all',
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE players (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid REFERENCES sessions(id) ON DELETE CASCADE,
  nickname     text NOT NULL,
  is_host      boolean DEFAULT false,
  is_alive     boolean DEFAULT true,
  joined_at    timestamptz DEFAULT now(),
  UNIQUE (session_id, nickname)
);

CREATE TABLE questions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text         text NOT NULL,
  answer       integer NOT NULL,
  category     text NOT NULL,
  time_limit   integer NOT NULL
);

CREATE INDEX idx_sessions_room_code ON sessions(room_code);
CREATE INDEX idx_players_session_id ON players(session_id);
