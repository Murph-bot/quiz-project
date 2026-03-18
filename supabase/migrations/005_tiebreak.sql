-- supabase/migrations/005_tiebreak.sql
-- null = normal round; ["player-id-1","player-id-2"] = tiebreak restricted to those players
ALTER TABLE rounds ADD COLUMN tiebreak_players JSONB;
