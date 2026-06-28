import { POST } from '@/app/api/sessions/[roomCode]/rounds/[roundId]/close/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
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

// A session with 3 active players in normal phase
const mockSessionSD = { id: 'sess-sd', phase: 'normal', category: 'all', host_id: 'host-1', bracket: null }
const mockQuestion = { answer: 1989 }

// 3 active players for sudden death tests
const threePlayers = [
  { id: 'p1', nickname: 'Alice' },
  { id: 'p2', nickname: 'Bob' },
  { id: 'p3', nickname: 'Carol' },
]

// Tiebreak/replay question returned from DB
const replayQuestion = {
  id: 'q-replay',
  text: 'What year was this?',
  answer: 2000,
  category: 'History',
  time_limit: 10,
}

/**
 * Build a supabase mock for sudden death all-tie tests.
 *
 * Scenario: normal round (no tiebreak_players), round_number > 50 (sudden death),
 * all alive players have the same max delta.
 *
 * DB call order:
 *   sessions call 1: SELECT session
 *   rounds   call 1: SELECT round (no tiebreak_players, round_number=51)
 *   rounds   call 2: UPDATE status=closed
 *   questions call 1: SELECT correct answer
 *   answers  call 1: SELECT answers
 *   players  call 1: SELECT active players
 *   [sudden death all-tie detection — eliminated.length === activeList.length]:
 *     rounds   call 3: SELECT question_id (used rounds for createTiebreakRound)
 *     questions call 2: SELECT replay question candidates
 *     rounds   call 4: SELECT round_number (latest)
 *     rounds   call 5: INSERT new replay round
 */
function makeSuddenDeathAllTieMock({
  rawAnswers,
  roundNumber = 51,
}: {
  rawAnswers: Array<{ player_id: string; value: number; players: { nickname: string } }>
  roundNumber?: number
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
            single: jest.fn().mockResolvedValue({ data: mockSessionSD, error: null }),
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
          // SELECT round — no tiebreak_players, round_number in sudden death
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'round-51',
                status: 'active',
                question_id: 'q-1',
                tiebreak_players: null,
                round_number: roundNumber,
              },
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
                    single: jest.fn().mockResolvedValue({ data: { id: 'round-51' }, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        if (n === 3) {
          // SELECT question_id (used rounds) for createTiebreakRound
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
          // SELECT round_number (latest) for createTiebreakRound
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({ data: [{ round_number: roundNumber }], error: null }),
                }),
              }),
            }),
          }
        }
        if (n === 5) {
          // INSERT new replay round
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'replay-round-1', started_at: '2024-01-01T01:00:00Z' },
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
        // questions call 2+: SELECT replay question candidates
        // category='all' → no .eq() call; select() must be directly thenable
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
                eq: jest.fn().mockResolvedValue({ data: threePlayers, error: null }),
              }),
            }),
          }
        }
        if (n === 3) {
          // SELECT COUNT alive (skippedElimination=true so no UPDATE, but aliveCount SELECT always runs)
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

/**
 * Build a supabase mock for sudden death normal elimination tests.
 *
 * Scenario: round_number > 50 but only one player has the worst delta —
 * normal single-player elimination, no all-tie replay needed.
 *
 * DB call order:
 *   sessions call 1: SELECT session
 *   rounds   call 1: SELECT round (no tiebreak_players, round_number=51)
 *   rounds   call 2: UPDATE status=closed
 *   questions call 1: SELECT correct answer
 *   answers  call 1: SELECT answers
 *   players  call 1: SELECT active players
 *   [normal elimination — eliminated.length < activeList.length]:
 *     players  call 2: UPDATE is_alive=false
 *     players  call 3: SELECT COUNT alive
 */
function makeSuddenDeathNormalElimMock({
  rawAnswers,
  aliveCountAfterElim,
  roundNumber = 51,
}: {
  rawAnswers: Array<{ player_id: string; value: number; players: { nickname: string } }>
  aliveCountAfterElim: number
  roundNumber?: number
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
            single: jest.fn().mockResolvedValue({ data: mockSessionSD, error: null }),
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
                id: 'round-51',
                status: 'active',
                question_id: 'q-1',
                tiebreak_players: null,
                round_number: roundNumber,
              },
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
                    single: jest.fn().mockResolvedValue({ data: { id: 'round-51' }, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        }
      }

      if (table === 'questions') {
        // SELECT correct answer
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
          // SELECT active players
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: threePlayers, error: null }),
              }),
            }),
          }
        }
        if (n === 3) {
          // UPDATE is_alive=false for eliminated player
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
                eq: jest.fn().mockResolvedValue({ count: aliveCountAfterElim, error: null }),
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

function makeNPlayerReplayResolutionMock({
  rawAnswers,
}: {
  rawAnswers: Array<{ player_id: string; value: number; players: { nickname: string } }>
}) {
  const threePlayers = [
    { id: 'p1', nickname: 'Alice' },
    { id: 'p2', nickname: 'Bob' },
    { id: 'p3', nickname: 'Carol' },
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
            single: jest.fn().mockResolvedValue({ data: mockSessionSD, error: null }),
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
                id: 'replay-round-1',
                status: 'active',
                question_id: 'q-1',
                tiebreak_players: ['p1', 'p2', 'p3'],
                round_number: 52,
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
                    single: jest.fn().mockResolvedValue({ data: { id: 'replay-round-1' }, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        return {}
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
            update: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ error: null }),
            }),
          }
        }
        if (n === 4) {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ count: 1, error: null }),
              }),
            }),
          }
        }
        if (n === 5) {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({
                    data: [{ id: 'p1', nickname: 'Alice' }],
                    error: null,
                  }),
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

describe('POST /api/sessions/[roomCode]/rounds/[roundId]/close — sudden death', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates a replay round when all players tie for worst in sudden death', async () => {
    // All 3 players have the same delta (100) — everyone tied for worst
    // correct answer = 1989; all guess 1889 → delta=100
    const answers = [
      { player_id: 'p1', value: 1889, players: { nickname: 'Alice' } }, // delta=100
      { player_id: 'p2', value: 1889, players: { nickname: 'Bob' } },   // delta=100
      { player_id: 'p3', value: 1889, players: { nickname: 'Carol' } }, // delta=100
    ]
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeSuddenDeathAllTieMock({ rawAnswers: answers, roundNumber: 51 })
    )
    const res = await POST(makeRequest('AB12', 'round-51'), params('AB12', 'round-51'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tiebreakNeeded).toBe(true)
    expect(body.eliminated).toEqual([])
    expect(body.tiebreakRoundId).toBe('replay-round-1')
    expect(body.tiebreakQuestion).not.toBeNull()
    expect(body.tiebreakQuestion.id).toBe('q-replay')
    expect(body.tiebreakPlayerIds).toHaveLength(3)
    expect(body.tiebreakPlayerIds).toContain('p1')
    expect(body.tiebreakPlayerIds).toContain('p2')
    expect(body.tiebreakPlayerIds).toContain('p3')
    expect(body.tiebreakStartedAt).toBe('2024-01-01T01:00:00Z')
  })

  it('eliminates normally in sudden death when not all players are tied', async () => {
    // p1 and p2 answer correctly, p3 answers wrong — binary scoring eliminates only p3
    // correct answer = 1989; p1→correct, p2→correct, p3→wrong
    const answers = [
      { player_id: 'p1', value: 1989, players: { nickname: 'Alice' } }, // correct
      { player_id: 'p2', value: 1989, players: { nickname: 'Bob' } },   // correct
      { player_id: 'p3', value: 1889, players: { nickname: 'Carol' } }, // wrong → eliminated
    ]
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeSuddenDeathNormalElimMock({ rawAnswers: answers, aliveCountAfterElim: 2, roundNumber: 51 })
    )
    const res = await POST(makeRequest('AB12', 'round-51'), params('AB12', 'round-51'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tiebreakNeeded).toBe(false)
    expect(body.eliminated).toHaveLength(1)
    expect(body.eliminated[0].playerId).toBe('p3')
    expect(body.eliminated[0].nickname).toBe('Carol')
    expect(body.gameOver).toBe(false)
  })

  it('eliminates all wrong players from a 3-player replay round', async () => {
    const replayAnswers = [
      { player_id: 'p1', value: 1989, players: { nickname: 'Alice' } },
      { player_id: 'p2', value: 1889, players: { nickname: 'Bob' } },
      { player_id: 'p3', value: 2089, players: { nickname: 'Carol' } },
    ]
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeNPlayerReplayResolutionMock({ rawAnswers: replayAnswers })
    )
    const res = await POST(makeRequest('AB12', 'replay-round-1'), params('AB12', 'replay-round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tiebreakNeeded).toBe(false)
    expect(body.eliminated).toHaveLength(2)
    const nicknames = body.eliminated.map((e: { nickname: string }) => e.nickname).sort()
    expect(nicknames).toEqual(['Bob', 'Carol'])
    expect(body.gameOver).toBe(true)
    expect(body.winner?.nickname).toBe('Alice')
  })
})
