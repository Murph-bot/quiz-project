import { POST } from '@/app/api/sessions/[roomCode]/rounds/[roundId]/close/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
jest.mock('@/lib/realtime', () => ({ broadcastToRoom: jest.fn(() => Promise.resolve()) }))
import { createServerClient } from '@/lib/supabase-server'

function makeRequest(roomCode: string, roundId: string) {
  return new NextRequest(`http://localhost/api/sessions/${roomCode}/rounds/${roundId}/close`, {
    method: 'POST',
    body: JSON.stringify({ playerId: 'host-1', sessionSecret: 'host-secret' }),
    headers: { 'Content-Type': 'application/json' },
  })
}

const params = (roomCode: string, roundId: string) => ({
  params: Promise.resolve({ roomCode, roundId }),
})

const mockSession = { id: 'sess-1', host_id: 'host-1', phase: 'normal', category: 'all', bracket: null }
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
              data: { id: 'round-1', status: roundStatus, question_id: 'q-1', tiebreak_players: null, round_number: 1, started_at: '2020-01-01T00:00:00Z' },
              error: null,
            }),
          }
        }
        return {
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: { id: 'round-1' }, error: null }),
                }),
              }),
            }),
          }),
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
          eq: jest.fn().mockResolvedValue({ data: rawAnswers, error: null }),
        }
      }
      if (table === 'players') {
        const n = next('players')
        if (n === 1) {
          // Verify sessionSecret: .select('id').eq('id', playerId).eq('session_secret', secret).single()
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: 'host-1' }, error: null }),
          }
        }
        if (n === 2) {
          // SELECT active players: .select('id, nickname').eq('session_id', ...).eq('is_alive', true)
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: activePlayers, error: null }),
              }),
            }),
          }
        }
        if (n === 3) {
          // UPDATE is_alive = false: .update({is_alive: false}).in('id', [...])
          return {
            update: updatePlayersMock,
            in: jest.fn().mockResolvedValue({ error: null }),
          }
        }
        if (n === 4) {
          // SELECT COUNT: .select('id', {count:'exact',head:true}).eq().eq()
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ count: aliveCountAfterElim, error: null }),
              }),
            }),
          }
        }
        if (n === 5) {
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

function makeWorstTiebreakMock({
  rawAnswers,
  tiedIds,
}: {
  rawAnswers: Array<{ player_id: string; value: number; players: { nickname: string } }>
  tiedIds: string[]
}) {
  return makeAllWrongReplayMock({ rawAnswers, tiebreakPlayerIds: tiedIds })
}

function makeAllWrongReplayMock({
  rawAnswers,
  tiebreakPlayerIds,
}: {
  rawAnswers: Array<{ player_id: string; value: number; players: { nickname: string } }>
  tiebreakPlayerIds?: string[]
}) {
  const replayQuestion = {
    id: 'q-replay',
    text: 'What year was this?',
    answer: 2000,
    category: 'History',
    time_limit: 10,
  }
  const threePlayers = [
    { id: 'p1', nickname: 'Alex' },
    { id: 'p2', nickname: 'Maria' },
    { id: 'p3', nickname: 'Nick' },
  ]
  const callMap: Record<string, number> = {}
  function next(key: string) {
    callMap[key] = (callMap[key] ?? 0) + 1
    return callMap[key]
  }

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        if (next('sessions') === 1) {
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

      if (table === 'rounds') {
        const n = next('rounds')
        if (n === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'round-1',
                started_at: '2020-01-01T00:00:00Z', status: 'active',
                question_id: 'q-1',
                tiebreak_players: null,
                round_number: 1,
              },
              error: null,
            }),
          }
        }
        if (n === 2) {
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  select: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: { id: 'round-1' }, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        if (n === 3) {
          const roundsData = { data: [], error: null }
          const chainableEq: any = Object.assign(Promise.resolve(roundsData), {
            eq: jest.fn().mockResolvedValue(roundsData),
            is: jest.fn().mockResolvedValue(roundsData),
          })
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue(chainableEq),
            }),
          }
        }
        if (n === 4) {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({ data: [{ round_number: 1 }], error: null }),
                }),
              }),
            }),
          }
        }
        if (n === 5) {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'replay-round-1', started_at: '2024-01-01T01:00:00Z' },
              error: null,
            }),
          }
        }
        return {}
      }

      if (table === 'questions') {
        const n = next('questions')
        if (n <= 2) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockQuestion, error: null }),
          }
        }
        const questionResult = { data: [replayQuestion], error: null }
        const questionSelectResult = Object.assign(Promise.resolve(questionResult), {
          eq: jest.fn().mockResolvedValue(questionResult),
        })
        return {
          select: jest.fn().mockReturnValue(questionSelectResult),
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
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: 'host-1' }, error: null }),
          }
        }
        if (n === 2) {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: threePlayers, error: null }),
              }),
            }),
          }
        }
        if (n === 3) {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ count: threePlayers.length, error: null }),
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

  it('eliminates only the farthest wrong answer (proximity scoring)', async () => {
    // Alex correct, Nick close wrong, Maria farthest wrong — only Maria eliminated
    const proximityAnswers = [
      { player_id: 'p1', value: 1989, players: { nickname: 'Alex' } },
      { player_id: 'p2', value: 2005, players: { nickname: 'Maria' } },
      { player_id: 'p3', value: 1991, players: { nickname: 'Nick' } },
    ]
    ;(createServerClient as jest.Mock).mockReturnValue(makeCloseMock({ rawAnswers: proximityAnswers, aliveCountAfterElim: 2 }))
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    expect(body.eliminated).toHaveLength(1)
    expect(body.eliminated[0].nickname).toBe('Maria')
    expect(body.gameOver).toBe(false)
  })

  it('enters the final when three players narrow to two survivors', async () => {
    const proximityAnswers = [
      { player_id: 'p1', value: 1989, players: { nickname: 'Alex' } },
      { player_id: 'p2', value: 2005, players: { nickname: 'Maria' } },
      { player_id: 'p3', value: 1991, players: { nickname: 'Nick' } },
    ]
    const survivors = [
      { id: 'p1', nickname: 'Alex' },
      { id: 'p3', nickname: 'Nick' },
    ]
    const callMap: Record<string, number> = {}
    function next(key: string) {
      callMap[key] = (callMap[key] ?? 0) + 1
      return callMap[key]
    }

    const mock = {
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
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          }
        }
        if (table === 'rounds') {
          const n = next('rounds')
          if (n === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: { id: 'round-1', started_at: '2020-01-01T00:00:00Z', status: 'active', question_id: 'q-1', tiebreak_players: null, round_number: 1 },
                error: null,
              }),
            }
          }
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  select: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: { id: 'round-1' }, error: null }),
                  }),
                }),
              }),
            }),
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
            eq: jest.fn().mockResolvedValue({ data: proximityAnswers, error: null }),
          }
        }
        if (table === 'players') {
          const n = next('players')
          if (n === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { id: 'host-1' }, error: null }),
            }
          }
          if (n === 2) {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({
                    data: [
                      { id: 'p1', nickname: 'Alex' },
                      { id: 'p2', nickname: 'Maria' },
                      { id: 'p3', nickname: 'Nick' },
                    ],
                    error: null,
                  }),
                }),
              }),
            }
          }
          if (n === 3) {
            return {
              update: jest.fn().mockReturnValue({
                in: jest.fn().mockResolvedValue({ error: null }),
              }),
            }
          }
          if (n === 4) {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ count: 2, error: null }),
                }),
              }),
            }
          }
          if (n === 5) {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ data: survivors, error: null }),
                }),
              }),
            }
          }
          return {}
        }
        return {}
      }),
    }

    ;(createServerClient as jest.Mock).mockReturnValue(mock)
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    expect(body.eliminated).toHaveLength(1)
    expect(body.finalReady).toBe(true)
    expect(body.aliveCount).toBe(2)
    expect(body.bracket?.finalists).toEqual(['p1', 'p3'])
  })

  it('creates a tiebreak when multiple players tie for farthest', async () => {
    const tiedWorstAnswers = [
      { player_id: 'p1', value: 1989, players: { nickname: 'Alex' } },
      { player_id: 'p2', value: 2005, players: { nickname: 'Maria' } },
      { player_id: 'p3', value: 1973, players: { nickname: 'Nick' } },
    ]
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeWorstTiebreakMock({ rawAnswers: tiedWorstAnswers, tiedIds: ['p2', 'p3'] }),
    )
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    expect(body.tiebreakNeeded).toBe(true)
    expect(body.tiebreakPlayerIds).toEqual(['p2', 'p3'])
    expect(body.eliminated).toEqual([])
  })

  it('creates a tiebreak when two players tie for farthest among three', async () => {
    const tiedAnswers = [
      { player_id: 'p1', value: 1989, players: { nickname: 'Alex' } },
      { player_id: 'p2', value: 2005, players: { nickname: 'Maria' } },
      { player_id: 'p3', value: 1973, players: { nickname: 'Nick' } },
    ]
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeWorstTiebreakMock({ rawAnswers: tiedAnswers, tiedIds: ['p2', 'p3'] }),
    )
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    expect(body.tiebreakNeeded).toBe(true)
    expect(body.tiebreakPlayerIds).toEqual(['p2', 'p3'])
    expect(body.eliminated).toEqual([])
  })

  it('eliminates no-answer players when they are farthest', async () => {
    // p3 did not answer — p1 and p2 both answer correctly, only p3 is eliminated
    const partialAnswers = [
      { player_id: 'p1', value: 1989, players: { nickname: 'Alex' } },
      { player_id: 'p2', value: 1989, players: { nickname: 'Maria' } },
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

  it('does not declare a winner when one player remains in normal phase', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeCloseMock({
        aliveCountAfterElim: 1,
        survivors: [{ id: 'p1', nickname: 'Alex' }],
      })
    )
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    expect(body.gameOver).toBe(false)
    expect(body.winner).toBeNull()
  })

  it('sets gameOver:false and creates replay when all players answer wrong', async () => {
    const allWrongAnswers = [
      { player_id: 'p1', value: 2005, players: { nickname: 'Alex' } },
      { player_id: 'p2', value: 2005, players: { nickname: 'Maria' } },
      { player_id: 'p3', value: 2005, players: { nickname: 'Nick' } },
    ]
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeAllWrongReplayMock({ rawAnswers: allWrongAnswers })
    )
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    expect(body.gameOver).toBe(false)
    expect(body.winner).toBeNull()
    expect(body.tiebreakNeeded).toBe(true)
    expect(body.eliminated).toEqual([])
    expect(body.tiebreakPlayerIds).toEqual(['p1', 'p2', 'p3'])
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

  it('eliminates only the farthest player when four are alive', async () => {
    // 4 players alive, 3 answer — only farthest eliminated, 3 remain (no bracket yet)
    const fourPlayers = [
      { id: 'p1', nickname: 'Alex' },
      { id: 'p2', nickname: 'Maria' },
      { id: 'p3', nickname: 'Nick' },
      { id: 'p4', nickname: 'Lena' },
    ]
    const fourAnswers = [
      { player_id: 'p1', value: 1989, players: { nickname: 'Alex' } },
      { player_id: 'p2', value: 1990, players: { nickname: 'Maria' } },
      { player_id: 'p3', value: 1989, players: { nickname: 'Nick' } },
      { player_id: 'p4', value: 2010, players: { nickname: 'Lena' } },
    ]
    const updatePlayersMock = jest.fn().mockReturnValue({
      in: jest.fn().mockResolvedValue({ error: null }),
    })
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeCloseMock({
        rawAnswers: fourAnswers,
        activePlayers: fourPlayers,
        aliveCountAfterElim: 3,
        updatePlayersMock,
      })
    )
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    expect(body.eliminated).toHaveLength(1)
    expect(body.eliminated[0].nickname).toBe('Lena')
    expect(updatePlayersMock).toHaveBeenCalled()
    expect(body.bracketReady).toBe(false)
    expect(body.gameOver).toBe(false)
  })

  it('enters bracket when elimination brings alive count to exactly 4', async () => {
    // 5 players alive, 1 eliminated → 4 remain → bracket transition
    const fivePlayers = [
      { id: 'p1', nickname: 'Alex' },
      { id: 'p2', nickname: 'Maria' },
      { id: 'p3', nickname: 'Nick' },
      { id: 'p4', nickname: 'Lena' },
      { id: 'p5', nickname: 'Kostas' },
    ]
    const fiveAnswers = [
      { player_id: 'p1', value: 1989, players: { nickname: 'Alex' } },   // correct
      { player_id: 'p2', value: 1989, players: { nickname: 'Maria' } },  // correct
      { player_id: 'p3', value: 1989, players: { nickname: 'Nick' } },   // correct
      { player_id: 'p4', value: 1989, players: { nickname: 'Lena' } },   // correct
      { player_id: 'p5', value: 2005, players: { nickname: 'Kostas' } }, // wrong → eliminated
    ]

    // Build a custom mock that handles the extra DB calls from generateBracketForSession
    const callMap: Record<string, number> = {}
    function next(key: string) {
      callMap[key] = (callMap[key] ?? 0) + 1
      return callMap[key]
    }

    const updatePlayersMock = jest.fn().mockReturnValue({
      in: jest.fn().mockResolvedValue({ error: null }),
    })

    const bracketPlayers = [
      { id: 'p1', nickname: 'Alex' },
      { id: 'p2', nickname: 'Maria' },
      { id: 'p3', nickname: 'Nick' },
      { id: 'p4', nickname: 'Lena' },
    ]

    const mock = {
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
          // UPDATE phase='semifinal', bracket=...
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          }
        }
        if (table === 'rounds') {
          const n = next('rounds')
          if (n === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: { id: 'round-1', started_at: '2020-01-01T00:00:00Z', status: 'active', question_id: 'q-1', tiebreak_players: null, round_number: 1 },
                error: null,
              }),
            }
          }
          if (n === 2) {
            // Round update (close)
            return {
              update: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    select: jest.fn().mockReturnValue({
                      single: jest.fn().mockResolvedValue({ data: { id: 'round-1' }, error: null }),
                    }),
                  }),
                }),
              }),
            }
          }
          // n === 3: generateBracketForSession rounds query
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  is: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
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
            eq: jest.fn().mockResolvedValue({ data: fiveAnswers, error: null }),
          }
        }
        if (table === 'players') {
          const n = next('players')
          if (n === 1) {
            // Verify sessionSecret
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { id: 'host-1' }, error: null }),
            }
          }
          if (n === 2) {
            // SELECT active players
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ data: fivePlayers, error: null }),
                }),
              }),
            }
          }
          if (n === 3) {
            // UPDATE is_alive = false
            return { update: updatePlayersMock, in: jest.fn().mockResolvedValue({ error: null }) }
          }
          if (n === 4) {
            // SELECT COUNT alive
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ count: 4, error: null }),
                }),
              }),
            }
          }
          if (n === 5) {
            // generateBracketForSession: SELECT alive players
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ data: bracketPlayers, error: null }),
                }),
              }),
            }
          }
          return {}
        }
        return {}
      }),
    }

    ;(createServerClient as jest.Mock).mockReturnValue(mock)
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    const body = await res.json()
    expect(body.eliminated).toHaveLength(1)
    expect(body.eliminated[0].nickname).toBe('Kostas')
    expect(body.bracketReady).toBe(true)
    expect(body.bracket).not.toBeNull()
    expect(body.gameOver).toBe(false)
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

  it('rejects an early close while the timer is still running and not everyone answered', async () => {
    // Round started seconds ago — deadline far in the future.
    const freshRound = {
      id: 'round-1',
      status: 'active',
      question_id: 'q-1',
      tiebreak_players: null,
      round_number: 1,
      started_at: new Date().toISOString(),
    }
    const mock = {
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
            single: jest.fn().mockResolvedValue({ data: freshRound, error: null }),
          }
        }
        if (table === 'questions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { time_limit: 30 }, error: null }),
          }
        }
        if (table === 'answers') {
          // 1 answer submitted so far
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ count: 1, error: null }),
            }),
          }
        }
        if (table === 'players') {
          const n = (mock as { __pc?: number }).__pc = ((mock as { __pc?: number }).__pc ?? 0) + 1
          if (n === 1) {
            // verifyPlayerSecret
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { id: 'host-1' }, error: null }),
            }
          }
          // alive-count query → 3 eligible players
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ count: 3, error: null }),
              }),
            }),
          }
        }
        return {}
      }),
    }
    ;(createServerClient as jest.Mock).mockReturnValue(mock)
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Round still in progress')
  })

  it('allows an early close when every eligible player has answered', async () => {
    const freshRound = {
      id: 'round-1',
      status: 'active',
      question_id: 'q-1',
      tiebreak_players: null,
      round_number: 1,
      started_at: new Date().toISOString(),
    }
    const playersCallMap: Record<string, number> = {}
    const mock = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          const n = (playersCallMap.sessions = (playersCallMap.sessions ?? 0) + 1)
          if (n === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: mockSession, error: null }),
            }
          }
          return { update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }) }
        }
        if (table === 'rounds') {
          const n = (playersCallMap.rounds = (playersCallMap.rounds ?? 0) + 1)
          if (n === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: freshRound, error: null }),
            }
          }
          // atomic close update
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  select: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: { id: 'round-1' }, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'questions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { time_limit: 30, answer: 1989 }, error: null }),
          }
        }
        if (table === 'answers') {
          // 3 of 3 answered (count query) and the ranked-answers fetch
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({ data: mockRawAnswers, count: 3, error: null }),
          }
        }
        if (table === 'players') {
          const n = (playersCallMap.players = (playersCallMap.players ?? 0) + 1)
          if (n === 1) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { id: 'host-1' }, error: null }),
            }
          }
          if (n === 2) {
            // alive-count for the early-close check → all 3 eligible
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ count: 3, error: null }),
                }),
              }),
            }
          }
          if (n === 3) {
            // active players for ranking
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ data: mockRawAnswers.map(a => ({ id: a.player_id, nickname: a.players.nickname })), error: null }),
                }),
              }),
            }
          }
          if (n === 4) {
            // UPDATE is_alive
            return { update: jest.fn().mockReturnValue({ in: jest.fn().mockResolvedValue({ error: null }) }) }
          }
          // alive count after elim
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ count: 2, error: null }),
              }),
            }),
          }
        }
        return {}
      }),
    }
    ;(createServerClient as jest.Mock).mockReturnValue(mock)
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.correctAnswer).toBe(1989)
  })
})
