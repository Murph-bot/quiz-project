import { POST } from '@/app/api/sessions/[roomCode]/join/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => true), clientKey: jest.fn(() => 'test') }))
import { createServerClient } from '@/lib/supabase-server'

function makeRequest(roomCode: string, body: object) {
  return new NextRequest(`http://localhost/api/sessions/${roomCode}/join`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const mockSession = { id: 'sess-1', status: 'lobby' }

describe('POST /api/sessions/[roomCode]/join', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 for invalid room code', async () => {
    const res = await POST(makeRequest('bad!', { nickname: 'Alice' }), {
      params: Promise.resolve({ roomCode: 'bad!' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 if nickname is missing', async () => {
    const res = await POST(makeRequest('AB12', {}), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 if session not found', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      }),
    })

    const res = await POST(makeRequest('AB12', { nickname: 'Alice' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 409 if session already started', async () => {
    let sessionsCalled = 0
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { ...mockSession, status: 'active' }, error: null }),
          }
        }
        // players table: no existing player found (new joiner, not a spectator reconnect)
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
        }
      }),
    })

    const res = await POST(makeRequest('AB12', { nickname: 'Alice' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(409)
  })

  it('returns 409 if nickname is already taken in this session', async () => {
    const mockSupabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockSession, error: null }),
          }
        }
        return {
          insert: jest.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate' } }),
        }
      }),
    }
    ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)

    const res = await POST(makeRequest('AB12', { nickname: 'Alice' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/taken/i)
  })

  it('returns 201 with playerId on success', async () => {
    const mockSupabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockSession, error: null }),
          }
        }
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
        }
      }),
    }
    ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)

    const res = await POST(makeRequest('AB12', { nickname: 'Alice' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toHaveProperty('playerId')
    expect(body).toHaveProperty('sessionSecret')
  })
})
