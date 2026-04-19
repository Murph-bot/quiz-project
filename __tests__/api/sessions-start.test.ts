import { POST } from '@/app/api/sessions/[roomCode]/start/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
import { createServerClient } from '@/lib/supabase-server'

function makeRequest(roomCode: string, body: object) {
  return new NextRequest(`http://localhost/api/sessions/${roomCode}/start`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const params = (roomCode: string) => ({ params: Promise.resolve({ roomCode }) })

const mockSession = { id: 'sess-1', status: 'lobby', category: 'all', host_id: 'p1' }
const mockQuestion = { id: 'q-1', text: 'When?', answer: 1989, category: 'history', time_limit: 12 }
const mockRound = { id: 'round-1', started_at: '2026-03-15T10:00:00Z' }

describe('POST /api/sessions/[roomCode]/start', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 for invalid room code', async () => {
    const res = await POST(makeRequest('!!!', { playerId: 'p1', sessionSecret: 'secret-1' }), params('!!!'))
    expect(res.status).toBe(400)
  })

  it('returns 400 if playerId is missing', async () => {
    const res = await POST(makeRequest('AB12', {}), params('AB12'))
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
    const res = await POST(makeRequest('AB12', { playerId: 'p1', sessionSecret: 'secret-1' }), params('AB12'))
    expect(res.status).toBe(404)
  })

  it('returns 403 if player is not host', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockSession, error: null }),
          }
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { is_host: false }, error: null }),
        }
      }),
    })
    const res = await POST(makeRequest('AB12', { playerId: 'p1', sessionSecret: 'secret-1' }), params('AB12'))
    expect(res.status).toBe(403)
  })

  it('returns 400 if fewer than 3 players', async () => {
    let playersCallCount = 0
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockSession, error: null }),
          }
        }
        // players: first call is host check (has .single()), second call is count (no .single())
        playersCallCount++
        if (playersCallCount === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { is_host: true }, error: null }),
          }
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ count: 2, error: null }) }),
        }
      }),
    })
    const res = await POST(makeRequest('AB12', { playerId: 'p1', sessionSecret: 'secret-1' }), params('AB12'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Need at least 3 players to start')
  })

  it('returns 409 if session is already active', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { ...mockSession, status: 'active' }, error: null }),
          }
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { is_host: true }, error: null }),
        }
      }),
    })
    const res = await POST(makeRequest('AB12', { playerId: 'p1', sessionSecret: 'secret-1' }), params('AB12'))
    expect(res.status).toBe(409)
  })

  it('returns 409 if no questions available', async () => {
    let playersCallCount = 0
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockSession, error: null }),
          }
        }
        if (table === 'players') {
          playersCallCount++
          if (playersCallCount === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { is_host: true }, error: null }),
            }
          }
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ count: 5, error: null }) }),
          }
        }
        // questions — empty result, thenable
        const result = Promise.resolve({ data: [], error: null })
        return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue(result), then: result.then.bind(result) }) }
      }),
    })
    const res = await POST(makeRequest('AB12', { playerId: 'p1', sessionSecret: 'secret-1' }), params('AB12'))
    expect(res.status).toBe(409)
  })

  it('returns 200 with round data including question shape on success', async () => {
    let sessionsCount = 0
    let playersCallCount = 0
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'players') {
          playersCallCount++
          if (playersCallCount === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { is_host: true }, error: null }),
            }
          }
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ count: 5, error: null }) }),
          }
        }
        if (table === 'questions') {
          const result = Promise.resolve({ data: [mockQuestion], error: null })
          return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue(result), then: result.then.bind(result) }) }
        }
        if (table === 'rounds') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockRound, error: null }),
          }
        }
        // sessions: first call = select/single, second call = update/eq
        sessionsCount++
        if (sessionsCount === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockSession, error: null }),
          }
        }
        return { update: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: null }) }
      }),
    })
    const res = await POST(makeRequest('AB12', { playerId: 'p1', sessionSecret: 'secret-1' }), params('AB12'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('roundId', 'round-1')
    expect(body).toHaveProperty('startedAt')
    expect(body.question).toMatchObject({
      id: 'q-1',
      text: 'When?',
      timeLimit: 12,
      category: 'history',
    })
  })
})
