ALTER TABLE sessions ADD COLUMN winner_id uuid REFERENCES players(id);
CREATE INDEX idx_sessions_winner_id ON sessions(winner_id);
