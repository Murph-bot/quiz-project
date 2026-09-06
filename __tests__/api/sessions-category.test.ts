import { PATCH } from '@/app/api/sessions/[roomCode]/category/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
jest.mock('@/lib/realtime', () => ({ broadcastToRoom: jest.fn(() => Promise.resolve()) }))
import { createServerClient } from '@/lib/supabase-server'

function makeRequest(roomCode: string, body: object) {
  return new NextRequest(`http://localhost/api/sessions/${roomCode}/category`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const mockSession = { id: 'sess-1' }

function makeSupabaseMock({ sessionExists = true, isHost = true } = {}) {
  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue(
            sessionExists
              ? { data: mockSession, error: null }
              : { data: null, error: { message: 'not found' } }
          ),
          update: jest.fn().mockReturnThis(),
        }
      }
      // players table
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { is_host: isHost }, error: null }),
      }
    }),
  }
}

describe('PATCH /api/sessions/[roomCode]/category', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 for invalid category', async () => {
    const res = await PATCH(makeRequest('AB12', { category: 'invalid', playerId: 'p1', sessionSecret: 'secret-1' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 if playerId is missing', async () => {
    const res = await PATCH(makeRequest('AB12', { category: 'all' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 if session not found', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabaseMock({ sessionExists: false }))
    const res = await PATCH(makeRequest('AB12', { category: 'all', playerId: 'p1', sessionSecret: 'secret-1' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 403 if player is not the host', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabaseMock({ isHost: false }))
    const res = await PATCH(makeRequest('AB12', { category: 'all', playerId: 'p1', sessionSecret: 'secret-1' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(403)
  })

  it('returns 200 on successful category update', async () => {
    let sessionsCallCount = 0
    const mockSupabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'players') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { is_host: true }, error: null }),
          }
        }
        // sessions table: first call = select/single for existence, second call = update
        sessionsCallCount++
        if (sessionsCallCount === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockSession, error: null }),
          }
        }
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        }
      }),
    }
    ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)

    const res = await PATCH(makeRequest('AB12', { category: 'history', playerId: 'p1', sessionSecret: 'secret-1' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(200)
  })
})
