import { POST } from '@/app/api/sessions/[roomCode]/rounds/[roundId]/answer/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
jest.mock('@/lib/realtime', () => ({ broadcastToRoom: jest.fn(() => Promise.resolve()) }))
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

const mockSession = { id: 'sess-1', phase: 'normal', bracket: null }
const mockRound = { id: 'round-1', session_id: 'sess-1', status: 'active' }

const SEMI_BRACKET = {
  sf1: { p1id: 'p1', p1: 'Alex', p2id: 'p2', p2: 'Maria', wins: [0, 0] },
  sf2: { p1id: 'p3', p1: 'Nick', p2id: 'p4', p2: 'Sara', wins: [0, 0] },
  currentSF: 1,
  finalists: [],
}

const FINAL_BRACKET = {
  sf1: { p1id: 'p1', p1: 'Alex', p2id: 'p2', p2: 'Maria', wins: [2, 0] },
  sf2: { p1id: '', p1: '', p2id: '', p2: '', wins: [0, 0] },
  currentSF: null,
  finalists: ['p1', 'p2'],
}

function makeSupabase({
  roundStatus = 'active',
  insertError = null as null | { code: string; message: string },
  tiebreakPlayers = undefined as string[] | null | undefined,
  sessionPhase = 'normal' as 'normal' | 'semifinal' | 'final',
  sessionBracket = null as Record<string, unknown> | null,
  playerInSession = true,
  playerIsAlive = true,
  answerCount = 1,
  aliveCount = 1,
} = {}) {
  // Track how many times each table has been called so we can distinguish
  // the credential-check players query from the alive-count players query,
  // and the insert answers query from the count answers query.
  const callCounts: Record<string, number> = {}

  return {
    from: jest.fn().mockImplementation((table: string) => {
      callCounts[table] = (callCounts[table] ?? 0) + 1
      const callIndex = callCounts[table] // 1-based

      if (table === 'sessions') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { ...mockSession, phase: sessionPhase, bracket: sessionBracket },
            error: null,
          }),
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
        if (callIndex === 1) {
          // First call: credential check
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({
                      data: playerInSession ? { id: 'p1', is_alive: playerIsAlive } : null,
                      error: playerInSession ? null : { message: 'not found' },
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        // Second call: alive count query
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: undefined,
          // Supabase count queries resolve directly on the builder
          // We simulate it by making the chain thenable
          __resolved: Promise.resolve({ count: aliveCount, error: null }),
          ...makeThenableChain({ count: aliveCount, error: null }),
        }
      }
      if (table === 'answers') {
        if (callIndex === 1) {
          // First call: insert
          return {
            insert: jest.fn().mockResolvedValue({ error: insertError }),
          }
        }
        // Second call: count query
        return makeThenableChain({ count: answerCount, error: null })
      }
      return {
        insert: jest.fn().mockResolvedValue({ error: insertError }),
      }
    }),
  }
}

// Creates a chainable mock that resolves to `result` when awaited.
// Supabase builders are awaited directly after chaining .select().eq()...
function makeThenableChain(result: object) {
  const chain: Record<string, unknown> = {}
  const resolved = Promise.resolve(result)
  // Make the object itself thenable so `await supabase.from(...).select(...).eq(...)` works
  chain.then = resolved.then.bind(resolved)
  chain.catch = resolved.catch.bind(resolved)
  chain.finally = resolved.finally.bind(resolved)
  // All chaining methods return the same thenable object
  const proxy: Record<string, unknown> = new Proxy(chain, {
    get(target, prop) {
      if (typeof prop === 'string' && prop in target) return target[prop]
      return () => proxy
    },
  })
  return proxy
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

  it('returns 409 when the DB deadline trigger rejects a late answer', async () => {
    // The round still reads as 'active' here (the host hasn't closed it
    // yet), but the BEFORE INSERT trigger on `answers` independently enforces
    // `now() <= started_at + time_limit + grace` and rejects the insert —
    // this is what closes the race between a slow client and a timed-out
    // round that a route-level status check alone can't catch.
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeSupabase({ insertError: { code: 'QK002', message: 'Round deadline has passed' } })
    )
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Round is closed')
  })

  it('returns 409 when the DB trigger rejects an insert into a non-active round', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeSupabase({ insertError: { code: 'QK001', message: 'Round is not active' } })
    )
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

  it('returns 403 if player is eliminated', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase({ playerIsAlive: false }))
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Eliminated players cannot answer')
  })

  it('returns 403 for any player when tiebreak_players is an empty array', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase({ tiebreakPlayers: [] }))
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(403)
  })

  it('returns allAnswered: true when this answer completes the round', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase({ answerCount: 3, aliveCount: 3 }))
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.allAnswered).toBe(true)
  })

  it('returns allAnswered: false when not all players have answered yet', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase({ answerCount: 2, aliveCount: 3 }))
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.allAnswered).toBe(false)
  })

  it('returns allAnswered: false when aliveCount is 0', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase({ answerCount: 0, aliveCount: 0 }))
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.allAnswered).toBe(false)
  })

  it('returns allAnswered: true for tiebreak when both tiebreakers have answered', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeSupabase({ tiebreakPlayers: ['p1', 'p2'], answerCount: 2, aliveCount: 5 })
    )
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.allAnswered).toBe(true)
  })

  it('returns allAnswered: false for tiebreak when only one tiebreaker has answered', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeSupabase({ tiebreakPlayers: ['p1', 'p2'], answerCount: 1, aliveCount: 5 })
    )
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.allAnswered).toBe(false)
  })

  // --- Bracket answer scoping ---

  it('returns 403 when a non-participant answers a semifinal round', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeSupabase({ sessionPhase: 'semifinal', sessionBracket: SEMI_BRACKET })
    )
    // p3 is in SF2 — the current match is SF1 (p1 vs p2)
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p3', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Not a match participant')
  })

  it('returns 200 when the current semifinal participant answers', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeSupabase({ sessionPhase: 'semifinal', sessionBracket: SEMI_BRACKET })
    )
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
  })

  it('returns 403 when a non-finalist answers a final round', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeSupabase({ sessionPhase: 'final', sessionBracket: FINAL_BRACKET })
    )
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p3', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(403)
  })

  it('returns 200 when a finalist answers a final round', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeSupabase({ sessionPhase: 'final', sessionBracket: FINAL_BRACKET })
    )
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p2', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
  })

  it('counts only match participants toward all-answered in a semifinal', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeSupabase({ sessionPhase: 'semifinal', sessionBracket: SEMI_BRACKET, answerCount: 2, aliveCount: 4 })
    )
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p2', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.allAnswered).toBe(true)
  })

  it('does not flag all-answered in a semifinal while a match player is still typing', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeSupabase({ sessionPhase: 'semifinal', sessionBracket: SEMI_BRACKET, answerCount: 1, aliveCount: 4 })
    )
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', sessionSecret: 'secret-1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.allAnswered).toBe(false)
  })
})
