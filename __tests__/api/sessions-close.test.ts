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

/**
 * Build a supabase mock for the close route.
 *
 * DB call order (after round-status check + update + question fetch + answers fetch):
 *   players call 1 : SELECT active players  (.select().eq().eq())
 *   players call 2 : UPDATE is_alive=false  (.update().in())   ← skipped when eliminated is empty
 *   players call 3 : SELECT COUNT alive     (.select().eq().eq())
 *   players call 4 : SELECT survivors       (.select().eq().eq().limit()) ← only when aliveCount===1
 *   sessions call 2: UPDATE status=finished                   ← only when aliveCount===0|1
 */
function makeCloseMock({
  roundStatus = 'active' as 'active' | 'closed',
  rawAnswers = mockRawAnswers as Array<{ player_id: string; value: number | null; players: { nickname: string } }>,
  activePlayers = [
    { id: 'p1', nickname: 'Alex' },
    { id: 'p2', nickname: 'Maria' },
    { id: 'p3', nickname: 'Nick' },
  ] as Array<{ id: string; nickname: string }>,
  aliveCountAfterElim = 2,
  survivors = [] as Array<{ id: string; nickname: string }>,
  updatePlayersMock = jest.fn().mockReturnThis(),
  updateSessionsMock = jest.fn().mockReturnThis(),
} = {}) {
  const callMap: Record<string, number> = {}
  function next(key: string) {
    callMap[key] = (callMap[key] ?? 0) + 1
    return callMap[key]
  }

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        if (next('sessions') === 1) {
          // Initial lookup
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockSession, error: null }),
          }
        }
        // UPDATE status = 'finished'
        return { update: updateSessionsMock, eq: jest.fn().mockResolvedValue({ error: null }) }
      }
      if (table === 'rounds') {
        if (next('rounds') === 1) {
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
          eq: jest.fn().mockResolvedValue({ data: rawAnswers, error: null }),
        }
      }
      if (table === 'players') {
        const n = next('players')
        if (n === 1) {
          // SELECT active players: .select('id, nickname').eq('session_id', ...).eq('is_alive', true)
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: activePlayers, error: null }),
              }),
            }),
          }
        }
        if (n === 2) {
          // UPDATE is_alive = false: .update({is_alive: false}).in('id', [...])
          return {
            update: updatePlayersMock,
            in: jest.fn().mockResolvedValue({ error: null }),
          }
        }
        if (n === 3) {
          // SELECT COUNT: .select('id', {count:'exact',head:true}).eq().eq()
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ count: aliveCountAfterElim, error: null }),
              }),
            }),
          }
        }
        if (n === 4) {
          // SELECT survivors: .select().eq().eq().limit(1)
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({ data: survivors, error: null }),
                }),
              }),
            }),
          }
        }
        return {}
      }
      return {}
    }),
  }
}

describe('POST /api/sessions/[roomCode]/rounds/[roundId]/close', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 200 with wasAlreadyClosed:true and does not update DB when round is already closed', async () => {
    const updateMock = jest.fn().mockReturnThis()
    const mock = makeCloseMock({ roundStatus: 'closed' })
    const originalFrom = mock.from
    mock.from = jest.fn().mockImplementation((table: string) => {
      const result = originalFrom(table)
      if (table === 'rounds') (result as Record<string, unknown>).update = updateMock
      return result
    })
    ;(createServerClient as jest.Mock).mockReturnValue(mock)
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.wasAlreadyClosed).toBe(true)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns 200 with correctAnswer and ranked answers on first close', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeCloseMock())
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.wasAlreadyClosed).toBe(false)
    expect(body.correctAnswer).toBe(1989)
    expect(body.answers).toHaveLength(3)
  })

  it('ranks answers by closeness ascending', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeCloseMock())
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

  // --- Layer 4: new test cases ---

  it('eliminates the player with the highest delta', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeCloseMock({ aliveCountAfterElim: 2 }))
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    // Maria has delta=16, the highest
    expect(body.eliminated).toHaveLength(1)
    expect(body.eliminated[0].nickname).toBe('Maria')
    expect(body.eliminated[0].playerId).toBe('p2')
  })

  it('eliminates all players tied for highest delta', async () => {
    const tiedAnswers = [
      { player_id: 'p1', value: 1989, players: { nickname: 'Alex' } },  // delta=0
      { player_id: 'p2', value: 2005, players: { nickname: 'Maria' } }, // delta=16
      { player_id: 'p3', value: 1973, players: { nickname: 'Nick' } },  // delta=16
    ]
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeCloseMock({
        rawAnswers: tiedAnswers,
        aliveCountAfterElim: 1,
        survivors: [{ id: 'p1', nickname: 'Alex' }],
      })
    )
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    expect(body.eliminated).toHaveLength(2)
    const eliminatedNicknames = body.eliminated.map((e: { nickname: string }) => e.nickname).sort()
    expect(eliminatedNicknames).toEqual(['Maria', 'Nick'])
  })

  it('eliminates no-answer players (treated as infinite delta)', async () => {
    // p3 did not answer — only p1 and p2 have answers
    const partialAnswers = [
      { player_id: 'p1', value: 1989, players: { nickname: 'Alex' } },
      { player_id: 'p2', value: 1991, players: { nickname: 'Maria' } },
    ]
    const allActivePlayers = [
      { id: 'p1', nickname: 'Alex' },
      { id: 'p2', nickname: 'Maria' },
      { id: 'p3', nickname: 'Nick' }, // Nick has no answer
    ]
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeCloseMock({ rawAnswers: partialAnswers, activePlayers: allActivePlayers, aliveCountAfterElim: 2 })
    )
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    // Nick (no answer) has MAX_SAFE_INTEGER delta → eliminated
    expect(body.eliminated).toHaveLength(1)
    expect(body.eliminated[0].nickname).toBe('Nick')
    // Nick appears at bottom of answers with noAnswer=true
    const nickEntry = body.answers.find((a: { nickname: string }) => a.nickname === 'Nick')
    expect(nickEntry.noAnswer).toBe(true)
    expect(nickEntry.value).toBeNull()
  })

  it('sets winner when exactly 1 player remains after elimination', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeCloseMock({
        aliveCountAfterElim: 1,
        survivors: [{ id: 'p1', nickname: 'Alex' }],
      })
    )
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    expect(body.gameOver).toBe(true)
    expect(body.winner).not.toBeNull()
    expect(body.winner.nickname).toBe('Alex')
    expect(body.winner.playerId).toBe('p1')
  })

  it('sets gameOver:true and winner:null when all players are eliminated simultaneously', async () => {
    // All 3 players tie for worst delta
    const allTiedAnswers = [
      { player_id: 'p1', value: 2005, players: { nickname: 'Alex' } },
      { player_id: 'p2', value: 2005, players: { nickname: 'Maria' } },
      { player_id: 'p3', value: 2005, players: { nickname: 'Nick' } },
    ]
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeCloseMock({ rawAnswers: allTiedAnswers, aliveCountAfterElim: 0 })
    )
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    expect(body.gameOver).toBe(true)
    expect(body.winner).toBeNull()
    expect(body.eliminated).toHaveLength(3)
  })

  it('sets gameOver:false and winner:null when 2+ players remain', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeCloseMock({ aliveCountAfterElim: 2 })
    )
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    expect(body.gameOver).toBe(false)
    expect(body.winner).toBeNull()
  })

  it('does not call player updates on the already-closed path', async () => {
    const updatePlayersMock = jest.fn().mockReturnThis()
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeCloseMock({ roundStatus: 'closed', updatePlayersMock })
    )
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    expect(body.wasAlreadyClosed).toBe(true)
    expect(updatePlayersMock).not.toHaveBeenCalled()
  })
})
