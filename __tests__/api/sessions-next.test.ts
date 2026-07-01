import { POST } from '@/app/api/sessions/[roomCode]/rounds/next/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
import { createServerClient } from '@/lib/supabase-server'

function makeRequest(roomCode: string, body: object) {
  return new NextRequest(`http://localhost/api/sessions/${roomCode}/rounds/next`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const params = (roomCode: string) => ({ params: Promise.resolve({ roomCode }) })

const mockSession = { id: 'sess-1', category: 'all', host_id: 'p1', phase: 'normal' }
const mockQuestion = { id: 'q-2', text: 'How many?', answer: 42, category: 'science', time_limit: 10 }
const mockNewRound = { id: 'round-2', started_at: '2026-03-15T10:01:00Z' }

/**
 * Build a supabase mock for the next route.
 *
 * DB call order:
 *   sessions  1: SELECT session
 *   players   1: SELECT host check (single)
 *   rounds    1: SELECT latest round (order/limit/single)
 *   rounds    2: SELECT used question_ids (eq resolves array)
 *   questions 1: SELECT all questions (thenable)
 *   rounds    3: INSERT new round
 *   (if newRoundNumber % 5 === 0 && phase === 'normal' && eliminatedPlayers.length > 0):
 *     players 2: SELECT eliminated players
 *     players 3: UPDATE resurrected player
 */
function makeNextMock({
  latestRoundNumber = 1,
  latestRoundStatus = 'closed' as 'active' | 'closed',
  noQuestions = false,
  eliminatedPlayers = [] as Array<{ id: string; nickname: string }>,
  aliveCount = 3,
} = {}) {
  const callMap: Record<string, number> = {}
  function next(key: string) {
    callMap[key] = (callMap[key] ?? 0) + 1
    return callMap[key]
  }

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        const n = next('sessions')
        if (n === 1) {
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
      }
      if (table === 'questions') {
        const result = Promise.resolve({
          data: noQuestions ? [] : [mockQuestion],
          error: null,
        })
        return { select: jest.fn().mockReturnValue({ then: result.then.bind(result) }) }
      }
      if (table === 'players') {
        const n = next('players')
        const newRoundNumber = latestRoundNumber + 1
        const resurrectionRound = newRoundNumber % 5 === 0

        if (n === 1) {
          // host check
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { is_host: true }, error: null }),
          }
        }
        if (resurrectionRound && n === 2) {
          // SELECT eliminated players: .select().eq().eq()
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: eliminatedPlayers, error: null }),
              }),
            }),
          }
        }
        if (resurrectionRound && eliminatedPlayers.length > 0 && n === 3) {
          // UPDATE resurrected player: .update().eq()
          return {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({ error: null }),
          }
        }
        // Alive count after optional resurrection
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ count: aliveCount, error: null }),
            }),
          }),
        }
      }
      if (table === 'rounds') {
        const n = next('rounds')
        if (n === 1) {
          // SELECT latest round
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'round-1', round_number: latestRoundNumber, status: latestRoundStatus },
              error: null,
            }),
          }
        }
        if (n === 2) {
          // SELECT used question IDs
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({ data: [{ question_id: 'q-1' }], error: null }),
          }
        }
        // n === 3: INSERT new round
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockNewRound, error: null }),
        }
      }
      return {}
    }),
  }
}

describe('POST /api/sessions/[roomCode]/rounds/next', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 if playerId is missing', async () => {
    const res = await POST(makeRequest('AB12', {}), params('AB12'))
    expect(res.status).toBe(400)
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

  it('returns 409 if current round is still active', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeNextMock({ latestRoundStatus: 'active' }))
    const res = await POST(makeRequest('AB12', { playerId: 'p1', sessionSecret: 'secret-1' }), params('AB12'))
    expect(res.status).toBe(409)
  })

  it('returns 409 if no questions available', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeNextMock({ noQuestions: true }))
    const res = await POST(makeRequest('AB12', { playerId: 'p1', sessionSecret: 'secret-1' }), params('AB12'))
    expect(res.status).toBe(409)
  })

  it('returns 200 with new round data on success', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeNextMock())
    const res = await POST(makeRequest('AB12', { playerId: 'p1', sessionSecret: 'secret-1' }), params('AB12'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('roundId', 'round-2')
    expect(body).toHaveProperty('roundNumber', 2)
    expect(body).toHaveProperty('question')
    expect(body).toHaveProperty('startedAt')
  })

  // --- Layer 4: resurrection test cases ---

  it('returns resurrected:null when round number is not a multiple of 5', async () => {
    // round 1 → new round 2, not a multiple of 5
    ;(createServerClient as jest.Mock).mockReturnValue(makeNextMock({ latestRoundNumber: 1 }))
    const res = await POST(makeRequest('AB12', { playerId: 'p1', sessionSecret: 'secret-1' }), params('AB12'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resurrected).toBeNull()
    expect(body.roundNumber).toBe(2)
  })

  it('returns resurrected:null when round is a multiple of 5 but no eliminated players', async () => {
    // round 4 → new round 5, multiple of 5, no eliminated pool to choose from
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeNextMock({ latestRoundNumber: 4 })
    )
    const res = await POST(makeRequest('AB12', { playerId: 'p1', sessionSecret: 'secret-1' }), params('AB12'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resurrected).toBeNull()
    expect(body.roundNumber).toBe(5)
  })

  it('returns resurrected:{playerId,nickname} when round is multiple of 5 and eliminated pool is non-empty', async () => {
    // round 4 → new round 5, 1 eliminated player available for resurrection
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeNextMock({
        latestRoundNumber: 4,
        eliminatedPlayers: [{ id: 'p-elim', nickname: 'Ghost' }],
      })
    )
    const res = await POST(makeRequest('AB12', { playerId: 'p1', sessionSecret: 'secret-1' }), params('AB12'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resurrected).not.toBeNull()
    expect(body.resurrected.playerId).toBe('p-elim')
    expect(body.resurrected.nickname).toBe('Ghost')
    expect(body.roundNumber).toBe(5)
  })
})
