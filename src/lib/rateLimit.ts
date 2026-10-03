// Fixed-window rate limiter. The durable path stores counters in Postgres
// (via the `increment_rate_limit` function, see supabase/migrations) so the
// limit holds across Worker isolates; the in-memory map below is only a
// fallback for when the DB call itself fails (or no client is supplied).

interface Bucket {
  count: number
  resetAt: number
}

interface RateLimitSupabase {
  rpc(
    fn: 'increment_rate_limit',
    args: { p_key: string; p_limit: number; p_window_ms: number },
  ): PromiseLike<{ data: boolean | null; error: { message: string } | null }>
}

const buckets = new Map<string, Bucket>()

// Bound memory: sweep expired buckets when the map grows large.
function sweep(now: number) {
  if (buckets.size < 5000) return
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key)
  }
}

function checkRateLimitMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  sweep(now)
  const bucket = buckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= limit) return false
  bucket.count++
  return true
}

/**
 * Returns true if the request is within the limit, false if rate-limited.
 * When `supabase` is provided, the counter is kept in Postgres so the limit
 * is shared across isolates; on any DB error this falls back to the
 * per-isolate in-memory map so a DB outage doesn't remove the limit entirely.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  // Typed as `unknown` and cast internally: the real argument is the
  // generated-types Supabase client, but giving `increment_rate_limit` a
  // concrete entry in that generated schema destabilizes unrelated
  // relationship-inference elsewhere (see commit message). This RPC call is
  // internal to the rate limiter, not part of the app's typed query surface.
  supabase?: unknown,
): Promise<boolean> {
  if (supabase) {
    try {
      const { data, error } = await (supabase as RateLimitSupabase).rpc('increment_rate_limit', {
        p_key: key,
        p_limit: limit,
        p_window_ms: windowMs,
      })
      if (!error && typeof data === 'boolean') return data
    } catch {
      // DB unreachable — fall through to the in-memory limiter below.
    }
  }
  return checkRateLimitMemory(key, limit, windowMs)
}

/**
 * Resolves the client IP to key rate limits on. Cloudflare overwrites
 * `CF-Connecting-IP` with the real connecting IP, so it is trustworthy;
 * `X-Forwarded-For` is attacker-controlled on the left (the client sets
 * whatever it wants there) and only the rightmost hop — appended by the
 * nearest proxy — can be trusted. That fallback only applies when there is
 * no CF header at all, i.e. local dev without Cloudflare in front.
 */
export function getClientIp(headers: { get(name: string): string | null }): string {
  const cf = headers.get('cf-connecting-ip')
  if (cf) return cf.trim()

  const fwd = headers.get('x-forwarded-for')
  if (fwd) {
    const hops = fwd.split(',').map((h) => h.trim()).filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1]
  }

  return headers.get('x-real-ip')?.trim() ?? 'unknown'
}

export function clientKey(req: Request, scope: string): string {
  return `${scope}:${getClientIp(req.headers)}`
}
