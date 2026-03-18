-- Enable Row Level Security on all public tables
-- Service role key (used in API routes) bypasses RLS entirely.
-- Anon key (used only for Realtime broadcasts) gets no direct table access.
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
