-- phase: 'normal' | 'semifinal' | 'final'
-- bracket: { sf1, sf2, currentSF, finalists, finalWins } — see docs/superpowers/specs/2026-03-18-semifinal-finals-design.md
ALTER TABLE sessions ADD COLUMN phase TEXT NOT NULL DEFAULT 'normal'
  CHECK (phase IN ('normal', 'semifinal', 'final'));
ALTER TABLE sessions ADD COLUMN bracket JSONB;
