CREATE TABLE public.quiz_rooms (code text PRIMARY KEY, state jsonb NOT NULL, version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.quiz_rooms TO service_role;
ALTER TABLE public.quiz_rooms ENABLE ROW LEVEL SECURITY;