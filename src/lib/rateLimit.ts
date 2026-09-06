// Minimal in-memory fixed-window rate limiter.
// On serverless each instance has its own map, so this is a soft cap —
// it stops casual abuse, not determined attackers.

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Bound memory: sweep expired buckets when the map grows large.
function sweep(now: number) {
  if (buckets.size < 5000) return
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key)
  }
}

/** Returns true if the request is within the limit, false if rate-limited. */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
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

export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get('x-forwarded-for')
  const ip = fwd?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'
  return `${scope}:${ip}`
}
