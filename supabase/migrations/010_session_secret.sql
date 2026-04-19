ALTER TABLE players ADD COLUMN IF NOT EXISTS session_secret UUID DEFAULT gen_random_uuid();
