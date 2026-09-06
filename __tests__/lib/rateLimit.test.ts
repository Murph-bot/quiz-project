import { checkRateLimit, clientKey } from '@/lib/rateLimit'
import { NextRequest } from 'next/server'

describe('checkRateLimit', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-03-15T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('allows requests up to the limit', () => {
    const key = `t1:${Math.random()}`
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000)).toBe(true)
    }
    expect(checkRateLimit(key, 5, 60_000)).toBe(false)
  })

  it('resets after the window expires', () => {
    const key = `t2:${Math.random()}`
    expect(checkRateLimit(key, 1, 1000)).toBe(true)
    expect(checkRateLimit(key, 1, 1000)).toBe(false)
    jest.advanceTimersByTime(1001)
    expect(checkRateLimit(key, 1, 1000)).toBe(true)
  })

  it('tracks keys independently', () => {
    const a = `a:${Math.random()}`
    const b = `b:${Math.random()}`
    checkRateLimit(a, 1, 60_000)
    expect(checkRateLimit(a, 1, 60_000)).toBe(false)
    expect(checkRateLimit(b, 1, 60_000)).toBe(true)
  })
})

describe('clientKey', () => {
  it('uses the first x-forwarded-for IP', () => {
    const req = new NextRequest('http://localhost/api/x', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(clientKey(req, 'scope')).toBe('scope:1.2.3.4')
  })

  it('falls back to x-real-ip then unknown', () => {
    const req = new NextRequest('http://localhost/api/x', {
      headers: { 'x-real-ip': '9.9.9.9' },
    })
    expect(clientKey(req, 'scope')).toBe('scope:9.9.9.9')
    const bare = new NextRequest('http://localhost/api/x')
    expect(clientKey(bare, 'scope')).toBe('scope:unknown')
  })
})
