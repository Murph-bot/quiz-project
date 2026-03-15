import { POST } from '@/app/api/sessions/[roomCode]/rounds/[roundId]/close/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
import { createServerClient } from '@/lib/supabase-server'

function makeRequest(roomCode: string, roundId: string) {
  return new NextRequest(`http://localhost/api/sessions/${roomCode}/rounds/${roundId}/close`, {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json' },
  })
}

const params = (roomCode: string, roundId: string) => ({
  params: Promise.resolve({ roomCode, roundId }),
})

const mockSession = { id: 'sess-1' }
const mockQuestion = { answer: 1989 }
const mockRawAnswers = [
  { player_id: 'p1', value: 1989, players: { nickname: 'Alex' } },
  { player_id: 'p2', value: 2005, players: { nickname: 'Maria' } },
  { player_id: 'p3', value: 1991, players: { nickname: 'Nick' } },
]

function makeSupabase({ roundStatus = 'active' } = {}) {
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
      if (table === 'questions') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockQuestion, error: null }),
        }
      }
      if (table === 'answers') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ data: mockRawAnswers, error: null }),
        }
      }
      // rounds — first call = select, second call = update
      roundsCount++
      if (roundsCount === 1) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'round-1', status: roundStatus, question_id: 'q-1' },
            error: null,
          }),
        }
      }
      return { update: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: null }) }
    }),
  }
}

describe('POST /api/sessions/[roomCode]/rounds/[roundId]/close', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 200 with wasAlreadyClosed:true and does not update DB when round is already closed', async () => {
    const updateMock = jest.fn().mockReturnThis()
    const mockSupabase = makeSupabase({ roundStatus: 'closed' })
    // Intercept any update call to verify it never fires
    const originalFrom = mockSupabase.from
    mockSupabase.from = jest.fn().mockImplementation((table: string) => {
      const result = originalFrom(table)
      if (table === 'rounds') result.update = updateMock
      return result
    })
    ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.wasAlreadyClosed).toBe(true)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns 200 with correctAnswer and ranked answers on first close', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase())
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.wasAlreadyClosed).toBe(false)
    expect(body.correctAnswer).toBe(1989)
    expect(body.answers).toHaveLength(3)
  })

  it('ranks answers by closeness ascending', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase())
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    // Alex=0, Nick=2, Maria=16
    expect(body.answers[0].nickname).toBe('Alex')
    expect(body.answers[0].delta).toBe(0)
    expect(body.answers[1].nickname).toBe('Nick')
    expect(body.answers[1].delta).toBe(2)
    expect(body.answers[2].nickname).toBe('Maria')
    expect(body.answers[2].delta).toBe(16)
  })
})
