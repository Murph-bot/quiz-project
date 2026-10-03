-- Durable rate limit counters, shared across Worker isolates (unlike the
-- per-isolate in-memory map in src/lib/rateLimit.ts, which is now only a
-- fallback for when this RPC is unreachable).

CREATE TABLE rate_limit_buckets (
  key        text PRIMARY KEY,
  count      integer NOT NULL,
  reset_at   timestamptz NOT NULL
);

-- Service role key (used in API routes, via the function below) bypasses
-- RLS entirely; no anon access is needed or granted.
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- Atomically increments the bucket for `p_key`, resetting it if the window
-- has elapsed, and returns whether the request is within `p_limit`. The
-- INSERT ... ON CONFLICT DO UPDATE is a single statement so concurrent
-- requests for the same key serialize on the row lock instead of racing.
CREATE OR REPLACE FUNCTION increment_rate_limit(p_key text, p_limit integer, p_window_ms integer)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
  v_now timestamptz := now();
BEGIN
  INSERT INTO rate_limit_buckets (key, count, reset_at)
  VALUES (p_key, 1, v_now + (p_window_ms::text || ' milliseconds')::interval)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
          WHEN rate_limit_buckets.reset_at <= v_now THEN 1
          ELSE rate_limit_buckets.count + 1
        END,
        reset_at = CASE
          WHEN rate_limit_buckets.reset_at <= v_now THEN v_now + (p_window_ms::text || ' milliseconds')::interval
          ELSE rate_limit_buckets.reset_at
        END
  RETURNING count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;
