-- Add options column to rounds for multiple choice questions
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS options jsonb;
