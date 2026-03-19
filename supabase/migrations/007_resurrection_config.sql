-- Add configurable resurrection interval to sessions
-- 0 = disabled, otherwise resurrect one eliminated player every N rounds
ALTER TABLE public.sessions
  ADD COLUMN resurrection_interval integer NOT NULL DEFAULT 5;
