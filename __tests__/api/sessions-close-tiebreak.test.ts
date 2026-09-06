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

// A session with 5 active players in normal phase
const mockSession5 = { id: 'sess-5', phase: 'normal', category: 'all', host_id: 'host-1', bracket: null }
const mockQuestion = { answer: 1989 }

// 5 active players
const fivePlayers = [
  { id: 'p1', nickname: 'Alice' },
  { id: 'p2', nickname: 'Bob' },
  { id: 'p3', nickname: 'Carol' },
  { id: 'p4', nickname: 'Dave' },
  { id: 'p5', nickname: 'Eve' },
]

// Tiebreak question returned from DB
const tbQuestion = {
  id: 'q-tb',
  text: 'What year?',
  answer: 2000,
  category: 'History',
  time_limit: 10,
}

/**
 * Build a supabase mock for tiebreak DETECTION tests.
 *
 * Scenario: normal round (no tiebreak_players), 5 active players.
 * DB call order:
 *   sessions call 1: SELECT session
 *   rounds   call 1: SELECT round (no tiebreak_players)
 *   rounds   call 2: UPDATE status=closed
 *   questions call 1: SELECT correct answer
 *   answers  call 1: SELECT answers
 *   players  call 1: SELECT active players (5)
 *   [tiebreak detection if eliminated.length === 2]:
 *     rounds   call 3: SELECT question_id (used rounds)
 *     questions call 2: SELECT tiebreak questions
 *     rounds   call 4: SELECT round_number (latest)
 *     rounds   call 5: INSERT new tiebreak round
 *   [else if eliminated.length !== 2 — normal elimination]:
 *     players  call 2: UPDATE is_alive=false
 *     players  call 3 (or 2 if no update): SELECT COUNT alive
 *     [if aliveCount===4 — bracketReady]:
 *       players  call 4: SELECT alive players (generateBracketForSession)
 *       rounds   call 3: SELECT rounds with answers (generateBracketForSession)
 *       sessions call 2: UPDATE phase=semifinal, bracket
 */
function makeDetectionMock({
  rawAnswers,
  aliveCountAfterElim,
  tiebreakDetected = false,
}: {
  rawAnswers: Array<{ player_id: string; value: number; players: { nickname: string } }>
  aliveCountAfterElim: number
  tiebreakDetected?: boolean
}) {
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
            single: jest.fn().mockResolvedValue({ data: mockSession5, error: null }),
          }
        }
        // sessions call 2: UPDATE phase=semifinal,bracket (bracketReady path)
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        }
      }

      if (table === 'rounds') {
        const n = next('rounds')
        if (n === 1) {
          // SELECT round — no tiebreak_players
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'round-1', status: 'active', question_id: 'q-1', tiebreak_players: null },
              error: null,
            }),
          }
        }
        if (n === 2) {
          // UPDATE status=closed (atomic: .eq('id').eq('status','active').select().single())
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
          // Two possible paths:
          //   tiebreak detection: .select('question_id').eq('session_id',x)  → await eq()
          //   bracketReady:       .select(...).eq('session_id',x).eq('status','closed').is('tiebreak_players',null) → await is()
          // Make each method return a thenable that also has the next method so both patterns work.
          const roundsData = { data: [], error: null }
          const chainableIs: any = Object.assign(Promise.resolve(roundsData), {
            is: jest.fn().mockResolvedValue(roundsData),
          })
          const chainableEq: any = Object.assign(Promise.resolve(roundsData), {
            eq: jest.fn().mockReturnValue(chainableIs),
            is: jest.fn().mockResolvedValue(roundsData),
          })
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue(chainableEq),
            }),
          }
        }
        if (n === 4) {
          // SELECT round_number (latest) for tiebreak: .select().eq().order().limit()
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
          // INSERT new tiebreak round
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'tb-round-1', started_at: '2024-01-01T00:00:00Z' },
              error: null,
            }),
          }
        }
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        }
      }

      if (table === 'questions') {
        const n = next('questions')
        if (n === 1) {
          // SELECT correct answer for the round
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockQuestion, error: null }),
          }
        }
        // questions call 2+: SELECT tiebreak question candidates
        // The query may or may not have .eq() (depends on category='all' vs specific)
        // When category='all': await questionQuery (no .eq call) → select() must be thenable
        // When category≠'all': await questionQuery.eq(...) → eq() must be thenable
        const questionResult = { data: [tbQuestion], error: null }
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
          // Verify sessionSecret: .select('id').eq('id', playerId).eq('session_secret', secret).single()
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: 'host-1' }, error: null }),
          }
        }
        if (n === 2) {
          // SELECT active players (5)
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: fivePlayers, error: null }),
              }),
            }),
          }
        }
        if (n === 3) {
          if (tiebreakDetected) {
            // Tiebreak path: no player UPDATE, call 3 is COUNT alive
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ count: aliveCountAfterElim, error: null }),
                }),
              }),
            }
          }
          // Normal elimination path: UPDATE is_alive=false
          return {
            update: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ error: null }),
            }),
          }
        }
        if (n === 4) {
          // SELECT COUNT alive after elimination (normal path only — tiebreak path exits earlier)
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ count: aliveCountAfterElim, error: null }),
              }),
            }),
          }
        }
        if (n === 5) {
          // SELECT alive players for generateBracketForSession
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({
                  data: [
                    { id: 'p1', nickname: 'Alice' },
                    { id: 'p2', nickname: 'Bob' },
                    { id: 'p3', nickname: 'Carol' },
                    { id: 'p4', nickname: 'Dave' },
                  ],
                  error: null,
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

/**
 * Build a mock for tiebreak RESOLUTION tests.
 *
 * The round has tiebreak_players set.
 *
 * DB call order:
 *   sessions call 1: SELECT session
 *   rounds   call 1: SELECT round (with tiebreak_players=['p4','p5'])
 *   rounds   call 2: UPDATE status=closed
 *   questions call 1: SELECT correct answer
 *   answers  call 1: SELECT answers for tiebreak players
 *   players  call 1: SELECT active players (5 — just to build activeList; not used for elimination)
 *   [tiebreak resolution]:
 *     if still tied:
 *       rounds call 3: SELECT question_id (used rounds)
 *       questions call 2: SELECT questions
 *       rounds call 4: SELECT round_number
 *       rounds call 5: INSERT new tiebreak round
 *     else (resolved):
 *       players call 2: UPDATE is_alive=false for loser
 *       players call 3: SELECT COUNT alive (4 → bracketReady)
 *       [generateBracketForSession if aliveCount===4]:
 *         players call 4: SELECT alive players
 *         rounds call 3: SELECT rounds with answers
 *       sessions call 2: UPDATE phase=semifinal, bracket
 */
function makeResolutionMock({
  tbAnswers,
  aliveAfterTB,
  stillTied = false,
}: {
  tbAnswers: Array<{ player_id: string; value: number; players: { nickname: string } }>
  aliveAfterTB: number
  stillTied?: boolean
}) {
  const callMap: Record<string, number> = {}
  function next(key: string) {
    callMap[key] = (callMap[key] ?? 0) + 1
    return callMap[key]
  }

  // Tiebreak round: only p4 and p5 are competing
  const tbRoundData = {
    id: 'tb-round-1',
    status: 'active',
    question_id: 'q-1',
    tiebreak_players: ['p4', 'p5'],
  }

  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        if (next('sessions') === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockSession5, error: null }),
          }
        }
        // sessions call 2: UPDATE phase=semifinal or bracket wins
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
            single: jest.fn().mockResolvedValue({ data: tbRoundData, error: null }),
          }
        }
        if (n === 2) {
          // UPDATE status=closed (atomic: .eq('id').eq('status','active').select().single())
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  select: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: { id: 'tb-round-1' }, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        if (n === 3) {
          // SELECT question_id (used rounds) for still-tied path
          // OR SELECT rounds with answers for generateBracketForSession (chains .eq().eq().is())
          const roundsData3 = { data: [], error: null }
          const chainableIs3: any = Object.assign(Promise.resolve(roundsData3), {
            is: jest.fn().mockResolvedValue(roundsData3),
          })
          const chainableEq3: any = Object.assign(Promise.resolve(roundsData3), {
            eq: jest.fn().mockReturnValue(chainableIs3),
            is: jest.fn().mockResolvedValue(roundsData3),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue(roundsData3),
          })
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue(chainableEq3),
            }),
          }
        }
        if (n === 4) {
          // SELECT round_number for still-tied tiebreak creation
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({ data: [{ round_number: 2 }], error: null }),
          }
        }
        if (n === 5) {
          // INSERT new tiebreak round (still-tied path)
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'tb-round-2', started_at: '2024-01-01T00:01:00Z' },
              error: null,
            }),
          }
        }
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        }
      }

      if (table === 'questions') {
        const n = next('questions')
        if (n === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockQuestion, error: null }),
          }
        }
        // questions call 2+: SELECT tiebreak question candidates
        // When category='all': no .eq() call → select() must be thenable
        // When category≠'all': .eq() is called → eq() must be thenable
        const questionResult2 = { data: [tbQuestion], error: null }
        const questionSelectResult2 = Object.assign(Promise.resolve(questionResult2), {
          eq: jest.fn().mockResolvedValue(questionResult2),
        })
        return {
          select: jest.fn().mockReturnValue(questionSelectResult2),
        }
      }

      if (table === 'answers') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ data: tbAnswers, error: null }),
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
          if (stillTied) {
            // Should not be reached in still-tied path — return empty
            return {}
          }
          // UPDATE is_alive=false for loser
          return {
            update: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ error: null }),
            }),
          }
        }
        if (n === 4) {
          // SELECT COUNT alive after elimination
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ count: aliveAfterTB, error: null }),
              }),
            }),
          }
        }
        if (n === 5) {
          // SELECT alive players for generateBracketForSession
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({
                  data: [
                    { id: 'p1', nickname: 'Alice' },
                    { id: 'p2', nickname: 'Bob' },
                    { id: 'p3', nickname: 'Carol' },
                    { id: 'p4', nickname: 'Dave' },
                  ],
                  error: null,
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

describe('POST /api/sessions/[roomCode]/rounds/[roundId]/close — tiebreak', () => {
  beforeEach(() => jest.clearAllMocks())

  // ---- BINARY SCORING TESTS (5-player rounds) ----

  it('eliminates only the farthest wrong player from a 5-player round', async () => {
    // Eve is farthest wrong; Dave is closer wrong and survives
    const answers = [
      { player_id: 'p1', value: 1989, players: { nickname: 'Alice' } },
      { player_id: 'p2', value: 1989, players: { nickname: 'Bob' } },
      { player_id: 'p3', value: 1989, players: { nickname: 'Carol' } },
      { player_id: 'p4', value: 1990, players: { nickname: 'Dave' } },
      { player_id: 'p5', value: 2089, players: { nickname: 'Eve' } },
    ]
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeDetectionMock({ rawAnswers: answers, aliveCountAfterElim: 4 })
    )
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tiebreakNeeded).toBe(false)
    expect(body.eliminated).toHaveLength(1)
    expect(body.eliminated[0].nickname).toBe('Eve')
    expect(body.bracketReady).toBe(true)
  })

  it('bracketReady:true when exactly 4 players remain after binary elimination', async () => {
    // p1-p4 answer correctly, p5 answers wrong → 1 eliminated, 4 remain → bracketReady
    const answers = [
      { player_id: 'p1', value: 1989, players: { nickname: 'Alice' } }, // correct
      { player_id: 'p2', value: 1989, players: { nickname: 'Bob' } },   // correct
      { player_id: 'p3', value: 1989, players: { nickname: 'Carol' } }, // correct
      { player_id: 'p4', value: 1989, players: { nickname: 'Dave' } },  // correct
      { player_id: 'p5', value: 1889, players: { nickname: 'Eve' } },   // wrong → eliminated
    ]
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeDetectionMock({ rawAnswers: answers, aliveCountAfterElim: 4 })
    )
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tiebreakNeeded).toBe(false)
    expect(body.eliminated).toHaveLength(1)
    expect(body.eliminated[0].nickname).toBe('Eve')
    expect(body.bracketReady).toBe(true)
    expect(body.bracket).not.toBeNull()
  })

  it('eliminates only the farthest wrong player when multiple are wrong', async () => {
    // Carol is farthest wrong; Dave is closer wrong
    const answers = [
      { player_id: 'p1', value: 1989, players: { nickname: 'Alice' } },
      { player_id: 'p2', value: 1989, players: { nickname: 'Bob' } },
      { player_id: 'p3', value: 1889, players: { nickname: 'Carol' } },
      { player_id: 'p4', value: 1990, players: { nickname: 'Dave' } },
      { player_id: 'p5', value: 1989, players: { nickname: 'Eve' } },
    ]
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeDetectionMock({ rawAnswers: answers, aliveCountAfterElim: 4 })
    )
    const res = await POST(makeRequest('AB12', 'round-1'), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.eliminated).toHaveLength(1)
    expect(body.eliminated[0].nickname).toBe('Carol')
    expect(body.bracketReady).toBe(true)
  })

  // ---- RESOLUTION TESTS ----

  it('eliminates the loser and returns bracketReady:true when tiebreak resolves with 4 remaining', async () => {
    // p4 guesses 1889 (delta=100), p5 guesses 1985 (delta=4) → p4 loses
    // correct answer = 1989
    const tbAnswers = [
      { player_id: 'p4', value: 1889, players: { nickname: 'Dave' } }, // delta=100, loser
      { player_id: 'p5', value: 1985, players: { nickname: 'Eve' } },  // delta=4, winner
    ]
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeResolutionMock({ tbAnswers, aliveAfterTB: 4 })
    )
    const res = await POST(makeRequest('AB12', 'tb-round-1'), params('AB12', 'tb-round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tiebreakNeeded).toBe(false)
    expect(body.eliminated).toHaveLength(1)
    expect(body.eliminated[0].playerId).toBe('p4')
    expect(body.eliminated[0].nickname).toBe('Dave')
    expect(body.bracketReady).toBe(true)
    expect(body.bracket).not.toBeNull()
    expect(body.gameOver).toBe(false)
  })

  it('returns tiebreakNeeded:true again when tiebreak round also ties', async () => {
    // p4 and p5 both guess 1889 (delta=100) — still tied
    const tbAnswers = [
      { player_id: 'p4', value: 1889, players: { nickname: 'Dave' } }, // delta=100
      { player_id: 'p5', value: 2089, players: { nickname: 'Eve' } },  // delta=100
    ]
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeResolutionMock({ tbAnswers, aliveAfterTB: 5, stillTied: true })
    )
    const res = await POST(makeRequest('AB12', 'tb-round-1'), params('AB12', 'tb-round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tiebreakNeeded).toBe(true)
    expect(body.eliminated).toEqual([])
    expect(body.tiebreakRoundId).toBe('tb-round-2')
    expect(body.tiebreakQuestion).not.toBeNull()
    expect(body.tiebreakPlayerIds).toEqual(['p4', 'p5'])
    expect(body.tiebreakStartedAt).toBe('2024-01-01T00:01:00Z')
    expect(body.bracketReady).toBe(false)
  })
})
