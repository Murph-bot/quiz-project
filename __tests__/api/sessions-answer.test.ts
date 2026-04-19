import { POST } from '@/app/api/sessions/[roomCode]/rounds/[roundId]/answer/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
import { createServerClient } from '@/lib/supabase-server'

function makeRequest(roomCode: string, roundId: string, body: object) {
  return new NextRequest(`http://localhost/api/sessions/${roomCode}/rounds/${roundId}/answer`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const params = (roomCode: string, roundId: string) => ({
  params: Promise.resolve({ roomCode, roundId }),
})

const mockSession = { id: 'sess-1' }
const mockRound = { id: 'round-1', session_id: 'sess-1', status: 'active' }

function makeSupabase({
  roundStatus = 'active',
  insertError = null as null | { code: string; message: string },
  tiebreakPlayers = undefined as string[] | null | undefined,
  playerInSession = true,
} = {}) {
  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockSession, error: null }),
        }
      }
      if (table === 'rounds') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { ...mockRound, status: roundStatus, tiebreak_players: tiebreakPlayers ?? null },
            error: null,
          }),
        }
      }
      if (table === 'players') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: playerInSession ? { id: 'p1' } : null,
                    error: playerInSession ? null : { message: 'not found' },
                  }),
                }),
              }),
            }),
          }),
        }
      }
      // answers
      return {
        insert: jest.fn().mockResolvedValue({ error: insertError }),
      }
    }),
  }
}

describe('POST /api/sessions/[roomCode]/rounds/[roundId]/answer', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 if value is missing', async () => {
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1' }), params('AB12', 'round-1'))
    expect(res.status).toBe(400)
  })

  it('returns 400 if value is a string', async () => {
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 'abc' }), params('AB12', 'round-1'))
    expect(res.status).toBe(400)
  })

  it('returns 400 if value is a float', async () => {
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 3.14 }), params('AB12', 'round-1'))
    expect(res.status).toBe(400)
  })

  it('returns 400 if playerId is missing', async () => {
    const res = await POST(makeRequest('AB12', 'round-1', { sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(400)
  })

  it('returns 400 if sessionSecret is missing', async () => {
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(400)
  })

  it('returns 409 if round is already closed', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase({ roundStatus: 'closed' }))
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(409)
  })

  it('returns 409 if player already answered (duplicate)', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeSupabase({ insertError: { code: '23505', message: 'duplicate' } })
    )
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(409)
  })

  it('returns 200 on success', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase())
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
  })

  it('returns 403 when player is not in tiebreak_players list', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase({ tiebreakPlayers: ['p2', 'p3'] }))
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Not a tiebreak participant')
  })

  it('returns 200 when player IS in tiebreak_players list', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase({ tiebreakPlayers: ['p1', 'p2'] }))
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
  })

  it('returns 200 for normal round (tiebreak_players is null)', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase({ tiebreakPlayers: null }))
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
  })

  it('returns 403 if sessionSecret is invalid', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase({ playerInSession: false }))
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'wrong-secret', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Invalid credentials')
  })

  it('returns 403 for any player when tiebreak_players is an empty array', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase({ tiebreakPlayers: [] }))
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(403)
  })
})
