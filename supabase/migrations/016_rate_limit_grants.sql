-- 014_rate_limits.sql enabled RLS on rate_limit_buckets but never revoked
-- EXECUTE on increment_rate_limit. PostgREST grants EXECUTE on functions in
-- the public schema to anon/authenticated by default, so anyone with the
-- shipped anon key could call the RPC directly to burn another IP's bucket
-- (e.g. lock the admin out via key `admin-login:<ip>`) or bloat the table —
-- RLS on the table doesn't help, since the function runs as its owner, not
-- as the caller. Restrict the RPC and the table to service_role only.
REVOKE ALL ON FUNCTION public.increment_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, integer, integer) TO service_role;

REVOKE ALL ON TABLE public.rate_limit_buckets FROM anon, authenticated;

-- Opportunistically purge long-expired buckets so the table doesn't grow
-- unbounded; cheap (1% of calls) and behaviour is otherwise unchanged.
CREATE OR REPLACE FUNCTION increment_rate_limit(p_key text, p_limit integer, p_window_ms integer)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
  v_now timestamptz := now();
BEGIN
  IF random() < 0.01 THEN
    DELETE FROM rate_limit_buckets WHERE reset_at < v_now - interval '1 day';
  END IF;

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

REVOKE ALL ON FUNCTION public.increment_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, integer, integer) TO service_role;
