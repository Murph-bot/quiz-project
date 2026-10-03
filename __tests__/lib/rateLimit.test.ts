import { checkRateLimit, clientKey, getClientIp } from '@/lib/rateLimit'
import { NextRequest } from 'next/server'

describe('checkRateLimit (in-memory fallback)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-03-15T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('allows requests up to the limit', async () => {
    const key = `t1:${Math.random()}`
    for (let i = 0; i < 5; i++) {
      expect(await checkRateLimit(key, 5, 60_000)).toBe(true)
    }
    expect(await checkRateLimit(key, 5, 60_000)).toBe(false)
  })

  it('resets after the window expires', async () => {
    const key = `t2:${Math.random()}`
    expect(await checkRateLimit(key, 1, 1000)).toBe(true)
    expect(await checkRateLimit(key, 1, 1000)).toBe(false)
    jest.advanceTimersByTime(1001)
    expect(await checkRateLimit(key, 1, 1000)).toBe(true)
  })

  it('tracks keys independently', async () => {
    const a = `a:${Math.random()}`
    const b = `b:${Math.random()}`
    await checkRateLimit(a, 1, 60_000)
    expect(await checkRateLimit(a, 1, 60_000)).toBe(false)
    expect(await checkRateLimit(b, 1, 60_000)).toBe(true)
  })
})

describe('checkRateLimit (durable Postgres counter)', () => {
  it('uses the RPC result when a supabase client is provided', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: false, error: null })
    const supabase = { rpc } as unknown as Parameters<typeof checkRateLimit>[3]

    const result = await checkRateLimit(`durable:${Math.random()}`, 5, 60_000, supabase)

    expect(rpc).toHaveBeenCalledWith('increment_rate_limit', expect.objectContaining({
      p_limit: 5,
      p_window_ms: 60_000,
    }))
    expect(result).toBe(false)
  })

  it('falls back to the in-memory limiter when the DB call fails', async () => {
    const rpc = jest.fn().mockRejectedValue(new Error('connection refused'))
    const supabase = { rpc } as unknown as Parameters<typeof checkRateLimit>[3]
    const key = `durable-fallback:${Math.random()}`

    expect(await checkRateLimit(key, 1, 60_000, supabase)).toBe(true)
    expect(await checkRateLimit(key, 1, 60_000, supabase)).toBe(false)
  })

  it('falls back to the in-memory limiter when the DB returns an error', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const supabase = { rpc } as unknown as Parameters<typeof checkRateLimit>[3]
    const key = `durable-error:${Math.random()}`

    expect(await checkRateLimit(key, 1, 60_000, supabase)).toBe(true)
    expect(await checkRateLimit(key, 1, 60_000, supabase)).toBe(false)
  })
})

describe('getClientIp', () => {
  it('prefers CF-Connecting-IP over X-Forwarded-For', () => {
    const req = new NextRequest('http://localhost/api/x', {
      headers: {
        'cf-connecting-ip': '9.9.9.9',
        'x-forwarded-for': 'spoofed-by-client, 1.2.3.4',
      },
    })
    expect(getClientIp(req.headers)).toBe('9.9.9.9')
  })

  it('falls back to the rightmost X-Forwarded-For hop when CF-Connecting-IP is absent', () => {
    // The leftmost hop is whatever the client sent; only the hop the nearest
    // trusted proxy appended (rightmost) can be trusted.
    const req = new NextRequest('http://localhost/api/x', {
      headers: { 'x-forwarded-for': 'spoofed-by-client, 5.6.7.8' },
    })
    expect(getClientIp(req.headers)).toBe('5.6.7.8')
  })

  it('falls back to x-real-ip then unknown when no proxy headers are present', () => {
    const req = new NextRequest('http://localhost/api/x', {
      headers: { 'x-real-ip': '9.9.9.9' },
    })
    expect(getClientIp(req.headers)).toBe('9.9.9.9')
    const bare = new NextRequest('http://localhost/api/x')
    expect(getClientIp(bare.headers)).toBe('unknown')
  })
})

describe('clientKey', () => {
  it('scopes the CF-Connecting-IP derived key', () => {
    const req = new NextRequest('http://localhost/api/x', {
      headers: { 'cf-connecting-ip': '1.2.3.4' },
    })
    expect(clientKey(req, 'scope')).toBe('scope:1.2.3.4')
  })
})
