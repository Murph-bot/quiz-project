import { closeBracketRound } from '@/lib/game/closeBracket'
import type { BracketState, Session } from '@/types'

type Result = { data?: unknown; error?: unknown }

/**
 * Table-shaped Supabase stub. Each table answers calls from its own queue in
 * order, so a test states the rows the code will read. Update payloads are
 * recorded so a test can assert what the server wrote.
 */
function makeSupabase(plan: Partial<Record<'answers' | 'questions' | 'rounds' | 'sessions', Result[]>>) {
  const queues: Record<string, Result[]> = {
    answers: [...(plan.answers ?? [])],
    questions: [...(plan.questions ?? [])],
    rounds: [...(plan.rounds ?? [])],
    sessions: [...(plan.sessions ?? [])],
  }
  const updates: Array<{ table: string; values: Record<string, unknown> }> = []

  function builder(table: string) {
    const entry = queues[table]?.shift() ?? { data: null, error: null }
    const settled = Promise.resolve(entry)
    const node: Record<string, unknown> = {
      then: settled.then.bind(settled),
      catch: settled.catch.bind(settled),
      finally: settled.finally.bind(settled),
      single: () => Promise.resolve(entry),
      maybeSingle: () => Promise.resolve(entry),
      select: () => node,
      eq: () => node,
      in: () => node,
      order: () => node,
      limit: () => node,
      update: (values: Record<string, unknown>) => {
        updates.push({ table, values })
        return node
      },
      insert: () => node,
    }
    return node
  }

  return { from: (table: string) => builder(table), updates }
}

function makeBracket(overrides: Partial<BracketState> = {}): BracketState {
  return {
    sf1: { p1id: 'p1', p1: 'Alex', p2id: 'p2', p2: 'Maria', wins: [0, 0] },
    sf2: { p1id: 'p3', p1: 'Nick', p2id: 'p4', p2: 'Sara', wins: [0, 0] },
    currentSF: 1,
    finalists: [],
    ...overrides,
  }
}

function sessionUpdates(db: ReturnType<typeof makeSupabase>) {
  return db.updates.filter((u) => u.table === 'sessions').map((u) => u.values)
}

function answer(playerId: string, value: number, nickname = playerId) {
  return { player_id: playerId, value, players: { nickname } }
}

function call(
  supabase: ReturnType<typeof makeSupabase>,
  session: Partial<Session>,
  roundId = 'round-1',
) {
  return closeBracketRound({
    supabase: supabase as never,
    session: { id: 'sess-1', ...session } as Session,
    roundId,
    round: { question_id: 'q-1' },
  })
}

const question = { answer: 100 }
const closedRound = { data: { id: 'round-1' }, error: null }

describe('closeBracketRound', () => {
  it('awards the semifinal round to the closer answer and saves the wins', async () => {
    const db = makeSupabase({
      answers: [{ data: [answer('p1', 90), answer('p2', 120)] }, { data: [answer('p1', 90), answer('p2', 120)] }],
      questions: [{ data: question }],
      rounds: [closedRound],
      sessions: [{ error: null }],
    })

    const res = await call(db, { phase: 'semifinal', bracket: makeBracket() })
    const body = await res.json()

    expect(body.sfComplete).toBe(false)
    expect(body.finalReady).toBe(false)
    expect(body.bracket.sf1.wins).toEqual([1, 0])
    expect(sessionUpdates(db)).toEqual([{ bracket: body.bracket }])
  })

  it('completes semifinal 2 into the final when both semifinal winners are known', async () => {
    const bracket = makeBracket({
      sf2: { p1id: 'p3', p1: 'Nick', p2id: 'p4', p2: 'Sara', wins: [1, 1] },
      currentSF: 2,
      finalists: ['p1'],
    })
    const db = makeSupabase({
      answers: [{ data: [answer('p3', 140), answer('p4', 101)] }, { data: [answer('p3', 140), answer('p4', 101)] }],
      questions: [{ data: question }],
      rounds: [closedRound],
      sessions: [{ error: null }],
    })

    const res = await call(db, { phase: 'semifinal', bracket })
    const body = await res.json()

    expect(body.sfComplete).toBe(true)
    expect(body.finalReady).toBe(true)
    expect(body.matchWinnerId).toBe('p4')
    expect(body.bracket.finalists).toEqual(['p1', 'p4'])
    expect(sessionUpdates(db)[0]).toMatchObject({ phase: 'final' })
  })

  it('finishes the session when a finalist reaches three round wins', async () => {
    const bracket = makeBracket({
      currentSF: null,
      finalists: ['p1', 'p2'],
      finalWins: [2, 0],
    })
    const db = makeSupabase({
      answers: [{ data: [answer('p1', 99, 'Alex'), answer('p2', 130, 'Maria')] }, { data: [answer('p1', 99, 'Alex'), answer('p2', 130, 'Maria')] }],
      questions: [{ data: question }],
      rounds: [closedRound],
      sessions: [{ error: null }],
    })

    const res = await call(db, { phase: 'final', bracket })
    const body = await res.json()

    expect(body.gameOver).toBe(true)
    expect(body.winner).toEqual({ playerId: 'p1', nickname: 'Alex' })
    expect(sessionUpdates(db)[0]).toMatchObject({ status: 'finished', winner_id: 'p1' })
  })

  it('replays the round without a win when both answers are equally far off', async () => {
    const db = makeSupabase({
      answers: [{ data: [answer('p1', 80), answer('p2', 120)] }, { data: [answer('p1', 80), answer('p2', 120)] }],
      questions: [{ data: question }],
      rounds: [closedRound],
    })

    const bracket = makeBracket({
      sf1: { p1id: 'p1', p1: 'Alex', p2id: 'p2', p2: 'Maria', wins: [1, 0] },
    })

    const res = await call(db, { phase: 'semifinal', bracket })
    const body = await res.json()

    expect(body.isTie).toBe(true)
    expect(body.bracket.sf1.wins).toEqual([1, 0])
    expect(sessionUpdates(db)).toEqual([])
  })

  it('treats two non-answers as a tie', async () => {
    const db = makeSupabase({
      answers: [{ data: [] }, { data: [] }],
      questions: [{ data: question }],
      rounds: [closedRound],
    })

    const res = await call(db, { phase: 'semifinal', bracket: makeBracket() })
    expect((await res.json()).isTie).toBe(true)
  })

  it('reports wasAlreadyClosed when another client won the close race', async () => {
    const db = makeSupabase({
      answers: [{ data: [answer('p1', 90)] }, { data: [answer('p1', 90)] }],
      questions: [{ data: question }],
      rounds: [{ data: null, error: { code: 'PGRST116', message: 'no rows' } }],
    })

    const res = await call(db, { phase: 'semifinal', bracket: makeBracket() })
    expect(await res.json()).toEqual({ wasAlreadyClosed: true })
  })
})
