-- Update all questions from 15s to 30s time limit
UPDATE questions SET time_limit = 30 WHERE time_limit = 15;
