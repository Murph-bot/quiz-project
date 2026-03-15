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

const mockSession = { id: 'sess-1', category: 'all', host_id: 'p1' }
const mockQuestion = { id: 'q-2', text: 'How many?', answer: 42, category: 'science', time_limit: 10 }
const mockNewRound = { id: 'round-2', started_at: '2026-03-15T10:01:00Z' }

function makeSupabase({ latestRoundStatus = 'closed', noQuestions = false } = {}) {
  let roundsCount = 0
  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockSession, error: null }),
        }
      }
      if (table === 'players') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { is_host: true }, error: null }),
        }
      }
      if (table === 'questions') {
        const result = Promise.resolve({
          data: noQuestions ? [] : [mockQuestion],
          error: null,
        })
        return { select: jest.fn().mockReturnValue({ then: result.then.bind(result) }) }
      }
      // rounds: call 1 = latest round check, call 2 = used question IDs, call 3 = insert
      roundsCount++
      if (roundsCount === 1) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'round-1', round_number: 1, status: latestRoundStatus },
            error: null,
          }),
        }
      }
      if (roundsCount === 2) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ data: [{ question_id: 'q-1' }], error: null }),
        }
      }
      // insert new round
      return {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockNewRound, error: null }),
      }
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
    const res = await POST(makeRequest('AB12', { playerId: 'p1' }), params('AB12'))
    expect(res.status).toBe(403)
  })

  it('returns 409 if current round is still active', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase({ latestRoundStatus: 'active' }))
    const res = await POST(makeRequest('AB12', { playerId: 'p1' }), params('AB12'))
    expect(res.status).toBe(409)
  })

  it('returns 409 if no questions available', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase({ noQuestions: true }))
    const res = await POST(makeRequest('AB12', { playerId: 'p1' }), params('AB12'))
    expect(res.status).toBe(409)
  })

  it('returns 200 with new round data on success', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase())
    const res = await POST(makeRequest('AB12', { playerId: 'p1' }), params('AB12'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('roundId', 'round-2')
    expect(body).toHaveProperty('roundNumber', 2)
    expect(body).toHaveProperty('question')
    expect(body).toHaveProperty('startedAt')
  })
})
