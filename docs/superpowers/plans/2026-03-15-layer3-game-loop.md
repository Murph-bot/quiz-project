# Layer 3: Game Loop Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the game loop: host starts the game, questions are shown with a server-driven countdown, players submit numeric guesses, a reveal screen ranks all answers by closeness, then auto-advances to the next question after 5 seconds.

**Architecture:** Four new API routes handle DB operations only (no broadcasting). Realtime broadcasts are sent by client components via the existing Supabase channel. `GameScreen` owns the phase state machine (`answering → waiting → reveal`). Timer is server-driven: clients compute the deadline from `started_at + time_limit` returned by the API.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS v4, Supabase JS v2 (Realtime Broadcast), Jest, @testing-library/react

---

## File Structure

### New Files
```
supabase/migrations/002_game_loop.sql
src/
  app/
    api/sessions/[roomCode]/
      start/route.ts
      rounds/
        [roundId]/
          answer/route.ts
          close/route.ts
        next/route.ts
    game/[roomCode]/page.tsx
  components/
    GameScreen.tsx
    QuestionPanel.tsx
    RevealPanel.tsx
  hooks/
    useCountdown.ts
__tests__/
  api/
    sessions-start.test.ts
    sessions-answer.test.ts
    sessions-close.test.ts
    sessions-next.test.ts
  hooks/
    useCountdown.test.ts
```

### Modified Files
```
src/types/index.ts                 - Add Round, Answer, Question, RankedAnswer interfaces
src/components/LobbyScreen.tsx     - Update handleStart to call POST /start, rename event to game:started
```

---

## Chunk 1: Foundation

### Task 1: DB migration

**Files:**
- Create: `supabase/migrations/002_game_loop.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/002_game_loop.sql

CREATE TABLE rounds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid REFERENCES sessions(id) ON DELETE CASCADE,
  question_id  uuid REFERENCES questions(id),
  round_number integer NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed'))
);

CREATE TABLE answers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id     uuid REFERENCES rounds(id) ON DELETE CASCADE,
  player_id    uuid REFERENCES players(id) ON DELETE CASCADE,
  value        integer NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, player_id)
);

CREATE INDEX idx_rounds_session_id ON rounds(session_id);
CREATE INDEX idx_answers_round_id ON answers(round_id);
```

- [ ] **Step 2: Apply migration in Supabase**

Open Supabase → SQL Editor → New query. Paste the contents of `002_game_loop.sql` and click Run. Verify: Table Editor should now show `rounds` and `answers` tables.

---

### Task 2: Update types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add new interfaces**

Open `src/types/index.ts` and append:

```typescript
export interface Round {
  id: string
  session_id: string
  question_id: string
  round_number: number
  started_at: string
  status: 'active' | 'closed'
}

export interface Answer {
  id: string
  round_id: string
  player_id: string
  value: number
  submitted_at: string
}

export interface Question {
  id: string
  text: string
  answer: number
  category: string
  time_limit: number
}

export interface RankedAnswer {
  playerId: string
  nickname: string
  value: number
  delta: number
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd quizknight && npx tsc --noEmit
```
Expected: no errors.

---

### Task 3: POST /start route

> **Broadcasting note:** The spec lists `game:started` broadcast as part of this route. In this plan, the route returns the round data and the **client** (LobbyScreen) broadcasts `game:started` after a successful response — see Task 12. This is intentional: Supabase Realtime channels require a persistent WebSocket subscription that cannot be reliably established in a stateless Next.js serverless function. The functional outcome is identical.

**Files:**
- Create: `src/app/api/sessions/[roomCode]/start/route.ts`
- Create: `__tests__/api/sessions-start.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/api/sessions-start.test.ts`:

```typescript
import { POST } from '@/app/api/sessions/[roomCode]/start/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
import { createServerClient } from '@/lib/supabase-server'

function makeRequest(roomCode: string, body: object) {
  return new NextRequest(`http://localhost/api/sessions/${roomCode}/start`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const params = (roomCode: string) => ({ params: Promise.resolve({ roomCode }) })

const mockSession = { id: 'sess-1', status: 'lobby', category: 'all', host_id: 'p1' }
const mockQuestion = { id: 'q-1', text: 'When?', answer: 1989, category: 'history', time_limit: 12 }
const mockRound = { id: 'round-1', started_at: '2026-03-15T10:00:00Z' }

describe('POST /api/sessions/[roomCode]/start', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 for invalid room code', async () => {
    const res = await POST(makeRequest('!!!', { playerId: 'p1' }), params('!!!'))
    expect(res.status).toBe(400)
  })

  it('returns 400 if playerId is missing', async () => {
    const res = await POST(makeRequest('AB12', {}), params('AB12'))
    expect(res.status).toBe(400)
  })

  it('returns 404 if session not found', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      }),
    })
    const res = await POST(makeRequest('AB12', { playerId: 'p1' }), params('AB12'))
    expect(res.status).toBe(404)
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

  it('returns 409 if session is already active', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { ...mockSession, status: 'active' }, error: null }),
          }
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { is_host: true }, error: null }),
        }
      }),
    })
    const res = await POST(makeRequest('AB12', { playerId: 'p1' }), params('AB12'))
    expect(res.status).toBe(409)
  })

  it('returns 409 if no questions available', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue({
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
        // questions — empty result, thenable
        const result = Promise.resolve({ data: [], error: null })
        return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue(result), then: result.then.bind(result) }) }
      }),
    })
    const res = await POST(makeRequest('AB12', { playerId: 'p1' }), params('AB12'))
    expect(res.status).toBe(409)
  })

  it('returns 200 with round data including question shape on success', async () => {
    let sessionsCount = 0
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'players') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { is_host: true }, error: null }),
          }
        }
        if (table === 'questions') {
          const result = Promise.resolve({ data: [mockQuestion], error: null })
          return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue(result), then: result.then.bind(result) }) }
        }
        if (table === 'rounds') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockRound, error: null }),
          }
        }
        // sessions: first call = select/single, second call = update/eq
        sessionsCount++
        if (sessionsCount === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockSession, error: null }),
          }
        }
        return { update: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: null }) }
      }),
    })
    const res = await POST(makeRequest('AB12', { playerId: 'p1' }), params('AB12'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('roundId', 'round-1')
    expect(body).toHaveProperty('startedAt')
    expect(body.question).toMatchObject({
      id: 'q-1',
      text: 'When?',
      timeLimit: 12,
      category: 'history',
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd quizknight && npx jest __tests__/api/sessions-start.test.ts --no-coverage
```
Expected: all tests fail (module not found).

- [ ] **Step 3: Implement the route**

Create `src/app/api/sessions/[roomCode]/start/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params
  const body = await req.json()
  const { playerId } = body

  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }
  if (!playerId) {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, status, category, host_id')
    .eq('room_code', roomCode)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('is_host')
    .eq('id', playerId)
    .eq('session_id', session.id)
    .single()

  if (playerError || !player || !player.is_host) {
    return NextResponse.json({ error: 'Only the host can start the game' }, { status: 403 })
  }

  if (session.status !== 'lobby') {
    return NextResponse.json({ error: 'Game already started' }, { status: 409 })
  }

  // Pick a random question from the selected category
  let questionQuery = supabase
    .from('questions')
    .select('id, text, answer, category, time_limit')
  if (session.category !== 'all') {
    questionQuery = questionQuery.eq('category', session.category)
  }
  const { data: questions } = await questionQuery

  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: 'No questions available' }, { status: 409 })
  }

  const question = questions[Math.floor(Math.random() * questions.length)]

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .insert({ session_id: session.id, question_id: question.id, round_number: 1 })
    .select('id, started_at')
    .single()

  if (roundError || !round) {
    return NextResponse.json({ error: 'Failed to create round' }, { status: 500 })
  }

  await supabase.from('sessions').update({ status: 'active' }).eq('id', session.id)

  return NextResponse.json({
    roundId: round.id,
    question: { id: question.id, text: question.text, timeLimit: question.time_limit, category: question.category },
    startedAt: round.started_at,
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd quizknight && npx jest __tests__/api/sessions-start.test.ts --no-coverage
```
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
cd quizknight && git add supabase/migrations/002_game_loop.sql src/types/index.ts "__tests__/api/sessions-start.test.ts"
git add "src/app/api/sessions/[roomCode]/start/route.ts"
git commit -m "feat: add DB migration, types, and POST /start route"
```

---

## Chunk 2: Answer, Close, and Next Routes

### Task 4: POST /answer route

**Files:**
- Create: `src/app/api/sessions/[roomCode]/rounds/[roundId]/answer/route.ts`
- Create: `__tests__/api/sessions-answer.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/api/sessions-answer.test.ts`:

```typescript
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

function makeSupabase({ roundStatus = 'active', insertError = null } = {}) {
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
            data: { ...mockRound, status: roundStatus },
            error: null,
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
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1' }), params('AB12', 'round-1'))
    expect(res.status).toBe(400)
  })

  it('returns 400 if value is a string', async () => {
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', value: 'abc' }), params('AB12', 'round-1'))
    expect(res.status).toBe(400)
  })

  it('returns 400 if value is a float', async () => {
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', value: 3.14 }), params('AB12', 'round-1'))
    expect(res.status).toBe(400)
  })

  it('returns 400 if playerId is missing', async () => {
    const res = await POST(makeRequest('AB12', 'round-1', { value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(400)
  })

  it('returns 409 if round is already closed', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase({ roundStatus: 'closed' }))
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(409)
  })

  it('returns 409 if player already answered (duplicate)', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(
      makeSupabase({ insertError: { code: '23505', message: 'duplicate' } })
    )
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(409)
  })

  it('returns 200 on success', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue(makeSupabase())
    const res = await POST(makeRequest('AB12', 'round-1', { playerId: 'p1', value: 1989 }), params('AB12', 'round-1'))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd quizknight && npx jest __tests__/api/sessions-answer.test.ts --no-coverage
```
Expected: all fail (module not found).

- [ ] **Step 3: Implement the route**

Create `src/app/api/sessions/[roomCode]/rounds/[roundId]/answer/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string; roundId: string }> }
) {
  const { roomCode, roundId } = await params
  const body = await req.json()
  const { playerId, value } = body

  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }
  if (!playerId) {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 })
  }
  if (value === undefined || value === null || typeof value !== 'number' || !Number.isInteger(value)) {
    return NextResponse.json({ error: 'value must be an integer' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('room_code', roomCode)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, status')
    .eq('id', roundId)
    .eq('session_id', session.id)
    .single()

  if (roundError || !round) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  }

  if (round.status === 'closed') {
    return NextResponse.json({ error: 'Round already closed' }, { status: 409 })
  }

  const { error: insertError } = await supabase
    .from('answers')
    .insert({ round_id: roundId, player_id: playerId, value })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'Already answered' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to submit answer' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd quizknight && npx jest __tests__/api/sessions-answer.test.ts --no-coverage
```
Expected: all 6 tests pass.

---

### Task 5: POST /close route

**Files:**
- Create: `src/app/api/sessions/[roomCode]/rounds/[roundId]/close/route.ts`
- Create: `__tests__/api/sessions-close.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/api/sessions-close.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd quizknight && npx jest __tests__/api/sessions-close.test.ts --no-coverage
```
Expected: all fail (module not found).

- [ ] **Step 3: Implement the route**

Create `src/app/api/sessions/[roomCode]/rounds/[roundId]/close/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string; roundId: string }> }
) {
  const { roomCode, roundId } = await params

  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('room_code', roomCode)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, status, question_id')
    .eq('id', roundId)
    .eq('session_id', session.id)
    .single()

  if (roundError || !round) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  }

  // Idempotency: already closed
  if (round.status === 'closed') {
    return NextResponse.json({ wasAlreadyClosed: true })
  }

  await supabase.from('rounds').update({ status: 'closed' }).eq('id', roundId)

  const { data: question } = await supabase
    .from('questions')
    .select('answer')
    .eq('id', round.question_id)
    .single()

  const correctAnswer = question!.answer

  const { data: rawAnswers } = await supabase
    .from('answers')
    .select('player_id, value, players(nickname)')
    .eq('round_id', roundId)

  const answers = ((rawAnswers ?? []) as Array<{ player_id: string; value: number; players: { nickname: string } }>)
    .map(a => ({
      playerId: a.player_id,
      nickname: a.players.nickname,
      value: a.value,
      delta: Math.abs(a.value - correctAnswer),
    }))
    .sort((a, b) => a.delta - b.delta)

  return NextResponse.json({ correctAnswer, answers, wasAlreadyClosed: false })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd quizknight && npx jest __tests__/api/sessions-close.test.ts --no-coverage
```
Expected: all 3 tests pass.

---

### Task 6: POST /next route

**Files:**
- Create: `src/app/api/sessions/[roomCode]/rounds/next/route.ts`
- Create: `__tests__/api/sessions-next.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/api/sessions-next.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd quizknight && npx jest __tests__/api/sessions-next.test.ts --no-coverage
```
Expected: all fail (module not found).

- [ ] **Step 3: Implement the route**

Create `src/app/api/sessions/[roomCode]/rounds/next/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params
  const body = await req.json()
  const { playerId } = body

  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }
  if (!playerId) {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, category, host_id')
    .eq('room_code', roomCode)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('is_host')
    .eq('id', playerId)
    .eq('session_id', session.id)
    .single()

  if (playerError || !player || !player.is_host) {
    return NextResponse.json({ error: 'Only the host can advance' }, { status: 403 })
  }

  // Get latest round
  const { data: latestRound, error: roundError } = await supabase
    .from('rounds')
    .select('id, round_number, status')
    .eq('session_id', session.id)
    .order('round_number', { ascending: false })
    .limit(1)
    .single()

  if (roundError || !latestRound) {
    return NextResponse.json({ error: 'No round found' }, { status: 404 })
  }

  if (latestRound.status !== 'closed') {
    return NextResponse.json({ error: 'Current round still active' }, { status: 409 })
  }

  // Get used question IDs
  const { data: usedRounds } = await supabase
    .from('rounds')
    .select('question_id')
    .eq('session_id', session.id)

  const usedIds = usedRounds?.map((r: { question_id: string }) => r.question_id) ?? []

  // Pick next question
  let questionQuery = supabase.from('questions').select('id, text, answer, category, time_limit')
  if (session.category !== 'all') {
    questionQuery = questionQuery.eq('category', session.category)
  }
  const { data: allQuestions } = await questionQuery
  const available = (allQuestions ?? []).filter((q: { id: string }) => !usedIds.includes(q.id))

  if (available.length === 0) {
    return NextResponse.json({ error: 'No questions available' }, { status: 409 })
  }

  const question = available[Math.floor(Math.random() * available.length)]

  const { data: round, error: newRoundError } = await supabase
    .from('rounds')
    .insert({
      session_id: session.id,
      question_id: question.id,
      round_number: latestRound.round_number + 1,
    })
    .select('id, started_at')
    .single()

  if (newRoundError || !round) {
    return NextResponse.json({ error: 'Failed to create round' }, { status: 500 })
  }

  return NextResponse.json({
    roundId: round.id,
    roundNumber: latestRound.round_number + 1,
    question: { id: question.id, text: question.text, timeLimit: question.time_limit, category: question.category },
    startedAt: round.started_at,
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd quizknight && npx jest __tests__/api/sessions-next.test.ts --no-coverage
```
Expected: all 5 tests pass.

- [ ] **Step 5: Run all tests to confirm nothing is broken**

```bash
cd quizknight && npx jest --no-coverage
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd quizknight && git add \
  "src/app/api/sessions/[roomCode]/rounds/[roundId]/answer/route.ts" \
  "src/app/api/sessions/[roomCode]/rounds/[roundId]/close/route.ts" \
  "src/app/api/sessions/[roomCode]/rounds/next/route.ts" \
  __tests__/api/sessions-answer.test.ts \
  __tests__/api/sessions-close.test.ts \
  __tests__/api/sessions-next.test.ts
git commit -m "feat: add answer, close, and next round API routes"
```

---

## Chunk 3: Frontend

### Task 7: useCountdown hook

**Files:**
- Create: `src/hooks/useCountdown.ts`
- Create: `__tests__/hooks/useCountdown.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/hooks/useCountdown.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react'
import { useCountdown } from '@/hooks/useCountdown'

describe('useCountdown', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('returns correct secondsLeft before deadline', () => {
    jest.spyOn(Date, 'now').mockReturnValue(0)
    const { result } = renderHook(() => useCountdown(10000))
    expect(result.current.secondsLeft).toBe(10)
    expect(result.current.isExpired).toBe(false)
  })

  it('returns 0 and isExpired:true when past deadline', () => {
    jest.spyOn(Date, 'now').mockReturnValue(20000)
    const { result } = renderHook(() => useCountdown(10000))
    expect(result.current.secondsLeft).toBe(0)
    expect(result.current.isExpired).toBe(true)
  })

  it('updates secondsLeft as time passes', () => {
    let now = 0
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    const { result } = renderHook(() => useCountdown(10000))
    expect(result.current.secondsLeft).toBe(10)
    act(() => {
      now = 3000
      jest.advanceTimersByTime(500)
    })
    expect(result.current.secondsLeft).toBe(7)
  })

  it('cleans up interval on unmount', () => {
    jest.spyOn(Date, 'now').mockReturnValue(0)
    const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval')
    const { unmount } = renderHook(() => useCountdown(10000))
    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd quizknight && npx jest __tests__/hooks/useCountdown.test.ts --no-coverage
```
Expected: all fail (module not found).

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useCountdown.ts`:

```typescript
'use client'

import { useState, useEffect } from 'react'

function computeSeconds(deadlineMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
}

export function useCountdown(deadlineMs: number): { secondsLeft: number; isExpired: boolean } {
  const [secondsLeft, setSecondsLeft] = useState(() => computeSeconds(deadlineMs))

  useEffect(() => {
    setSecondsLeft(computeSeconds(deadlineMs))
    const interval = setInterval(() => {
      setSecondsLeft(computeSeconds(deadlineMs))
    }, 500)
    return () => clearInterval(interval)
  }, [deadlineMs])

  return { secondsLeft, isExpired: secondsLeft === 0 }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd quizknight && npx jest __tests__/hooks/useCountdown.test.ts --no-coverage
```
Expected: all 4 tests pass.

---

### Task 8: QuestionPanel component

**Files:**
- Create: `src/components/QuestionPanel.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useState } from 'react'
import { useCountdown } from '@/hooks/useCountdown'

interface Props {
  roundNumber: number
  question: { id: string; text: string; timeLimit: number; category: string }
  startedAt: string
  isWaiting: boolean
  onSubmit: (value: number) => void
}

export function QuestionPanel({ roundNumber, question, startedAt, isWaiting, onSubmit }: Props) {
  const [input, setInput] = useState('')
  const deadlineMs = new Date(startedAt).getTime() + question.timeLimit * 1000
  const { secondsLeft } = useCountdown(deadlineMs)
  const progress = Math.round((secondsLeft / question.timeLimit) * 100)
  const disabled = isWaiting || secondsLeft === 0

  function handleSubmit() {
    const value = parseInt(input, 10)
    if (isNaN(value)) return
    onSubmit(value)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-4">
      <div className="w-full max-w-sm flex flex-col gap-5">

        <div className="flex justify-between items-center">
          <span className="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold">
            ROUND {roundNumber}
          </span>
          <span className="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold uppercase">
            {question.category}
          </span>
        </div>

        <div className="text-center">
          <div className="text-6xl font-black text-white leading-none">{secondsLeft}</div>
          <div className="text-white/60 text-xs uppercase tracking-widest mt-1">seconds left</div>
          <div className="bg-white/20 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className="bg-white h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="bg-white/15 backdrop-blur border border-white/30 rounded-2xl p-5 text-center">
          <p className="text-white font-bold text-lg leading-snug">{question.text}</p>
        </div>

        <div className="flex gap-3">
          <input
            type="number"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Your answer..."
            disabled={disabled}
            className="flex-1 bg-white/15 border-2 border-white/40 rounded-xl px-4 py-3 text-white font-bold text-lg text-center focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSubmit}
            disabled={disabled || input === ''}
            className="bg-white text-purple-700 font-black text-sm rounded-xl px-5 disabled:opacity-40 active:scale-95 transition-transform"
          >
            {isWaiting ? 'Sent!' : 'SUBMIT'}
          </button>
        </div>

        {isWaiting && (
          <p className="text-center text-white/60 text-sm">Waiting for round to close...</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd quizknight && npx tsc --noEmit
```
Expected: no errors.

---

### Task 9: RevealPanel component

**Files:**
- Create: `src/components/RevealPanel.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import type { RankedAnswer } from '@/types'

const MEDALS = ['🥇', '🥈', '🥉']

interface Props {
  roundNumber: number
  correctAnswer: number
  answers: RankedAnswer[]
  autoAdvanceIn: number
}

export function RevealPanel({ roundNumber, correctAnswer, answers, autoAdvanceIn }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-4">
      <div className="w-full max-w-sm flex flex-col gap-4">

        <div className="text-center">
          <span className="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold">
            ROUND {roundNumber} — RESULTS
          </span>
        </div>

        <div className="bg-white rounded-2xl py-4 text-center">
          <div className="text-xs font-bold text-purple-700 uppercase tracking-widest">Correct Answer</div>
          <div className="text-4xl font-black text-purple-700">{correctAnswer}</div>
        </div>

        <div className="flex flex-col gap-2">
          {answers.map((a, i) => (
            <div
              key={a.playerId}
              className="bg-white/15 backdrop-blur border border-white/30 rounded-xl px-4 py-3 flex justify-between items-center"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{MEDALS[i] ?? '▫️'}</span>
                <span className="text-white font-bold text-sm">{a.nickname}</span>
              </div>
              <div className="text-right">
                <span className="text-white font-black text-base">{a.value}</span>
                <span className="text-white/60 text-xs ml-2">
                  {a.delta === 0 ? 'exact!' : `off by ${a.delta}`}
                </span>
              </div>
            </div>
          ))}
        </div>

        {autoAdvanceIn > 0 && (
          <p className="text-center text-white/60 text-xs">
            Next question in <span className="font-bold text-white">{autoAdvanceIn}s</span>
          </p>
        )}

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd quizknight && npx tsc --noEmit
```
Expected: no errors.

---

### Task 10: GameScreen component

**Files:**
- Create: `src/components/GameScreen.tsx`

- [ ] **Step 1: Create the component**

`GameScreen` owns the Realtime channel and phase state machine. It reads `playerId` from `sessionStorage` (client-only) and derives `isHost` from `sessionHostId` passed down from the server component.

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCountdown } from '@/hooks/useCountdown'
import { QuestionPanel } from './QuestionPanel'
import { RevealPanel } from './RevealPanel'
import type { RankedAnswer } from '@/types'

interface QuestionData {
  id: string
  text: string
  timeLimit: number
  category: string
}

interface RevealData {
  correctAnswer: number
  answers: RankedAnswer[]
}

interface Props {
  roomCode: string
  sessionHostId: string
  initialRoundId: string
  initialRoundNumber: number
  initialQuestion: QuestionData
  initialStartedAt: string
  initialRevealData: RevealData | null
}

type Phase = 'answering' | 'waiting' | 'reveal'

export function GameScreen({
  roomCode,
  sessionHostId,
  initialRoundId,
  initialRoundNumber,
  initialQuestion,
  initialStartedAt,
  initialRevealData,
}: Props) {
  const router = useRouter()
  const playerId = typeof window !== 'undefined' ? sessionStorage.getItem('playerId') : null
  const isHost = playerId !== null && playerId === sessionHostId

  const [roundId, setRoundId] = useState(initialRoundId)
  const [roundNumber, setRoundNumber] = useState(initialRoundNumber)
  const [question, setQuestion] = useState(initialQuestion)
  const [startedAt, setStartedAt] = useState(initialStartedAt)
  const [phase, setPhase] = useState<Phase>(initialRevealData ? 'reveal' : 'answering')
  const [revealData, setRevealData] = useState<RevealData | null>(initialRevealData)
  const [autoAdvanceIn, setAutoAdvanceIn] = useState(5)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Redirect if no identity
  useEffect(() => {
    if (!playerId) router.push('/')
  }, [playerId, router])

  // Countdown for current question — used to trigger close when expired
  const deadlineMs = new Date(startedAt).getTime() + question.timeLimit * 1000
  const { isExpired } = useCountdown(phase === 'answering' ? deadlineMs : Date.now() + 999999)

  // Timer expired → race to close the round
  useEffect(() => {
    if (!isExpired || phase !== 'answering') return
    fetch(`/api/sessions/${roomCode}/rounds/${roundId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(r => r.json())
      .then(data => {
        if (!data.wasAlreadyClosed && channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'round:closed',
            payload: { correctAnswer: data.correctAnswer, answers: data.answers },
          })
        }
      })
  }, [isExpired, phase, roundId, roomCode])

  // Auto-advance after reveal: host calls /next, updates own state directly (Supabase
  // Broadcast does NOT echo back to the sender), then broadcasts to all other clients.
  useEffect(() => {
    if (phase !== 'reveal') return
    setAutoAdvanceIn(5)
    const tick = setInterval(() => setAutoAdvanceIn(s => Math.max(0, s - 1)), 1000)
    const advance = setTimeout(() => {
      if (!isHost || !playerId) return
      fetch(`/api/sessions/${roomCode}/rounds/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      })
        .then(r => r.json())
        .then(data => {
          // Host transitions its own state directly — it won't receive its own broadcast
          setRoundId(data.roundId)
          setRoundNumber(data.roundNumber)
          setQuestion(data.question)
          setStartedAt(data.startedAt)
          setRevealData(null)
          setPhase('answering')
          // Broadcast to all other clients
          channelRef.current?.send({
            type: 'broadcast',
            event: 'round:started',
            payload: {
              roundId: data.roundId,
              roundNumber: data.roundNumber,
              question: data.question,
              startedAt: data.startedAt,
            },
          })
        })
    }, 5000)
    return () => {
      clearInterval(tick)
      clearTimeout(advance)
    }
  }, [phase, isHost, playerId, roomCode])

  // Supabase Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomCode}`)
      .on('broadcast', { event: 'round:closed' }, ({ payload }) => {
        setRevealData({ correctAnswer: payload.correctAnswer, answers: payload.answers })
        setPhase('reveal')
      })
      .on('broadcast', { event: 'round:started' }, ({ payload }) => {
        setRoundId(payload.roundId)
        setRoundNumber(payload.roundNumber)
        setQuestion(payload.question)
        setStartedAt(payload.startedAt)
        setRevealData(null)
        setPhase('answering')
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [roomCode])

  async function handleSubmit(value: number) {
    if (!playerId) return
    const res = await fetch(`/api/sessions/${roomCode}/rounds/${roundId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, value }),
    })
    if (res.ok) setPhase('waiting')
  }

  if (phase === 'reveal' && revealData) {
    return (
      <RevealPanel
        roundNumber={roundNumber}
        correctAnswer={revealData.correctAnswer}
        answers={revealData.answers}
        autoAdvanceIn={autoAdvanceIn}
      />
    )
  }

  return (
    <QuestionPanel
      roundNumber={roundNumber}
      question={question}
      startedAt={startedAt}
      isWaiting={phase === 'waiting'}
      onSubmit={handleSubmit}
    />
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd quizknight && npx tsc --noEmit
```
Expected: no errors.

---

### Task 11: Game page (server component)

**Files:**
- Create: `src/app/game/[roomCode]/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { GameScreen } from '@/components/GameScreen'

interface Props {
  params: Promise<{ roomCode: string }>
}

export default async function GamePage({ params }: Props) {
  const { roomCode } = await params
  const supabase = createServerClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, status, host_id')
    .eq('room_code', roomCode)
    .single()

  if (!session) return notFound()
  if (session.status === 'lobby') redirect(`/lobby/${roomCode}`)
  if (session.status === 'finished') redirect('/')

  // Get current (latest) round
  const { data: round } = await supabase
    .from('rounds')
    .select('id, round_number, status, started_at, question_id')
    .eq('session_id', session.id)
    .order('round_number', { ascending: false })
    .limit(1)
    .single()

  if (!round) return notFound()

  const { data: question } = await supabase
    .from('questions')
    .select('id, text, answer, category, time_limit')
    .eq('id', round.question_id)
    .single()

  if (!question) return notFound()

  // If round is already closed, fetch reveal data so reconnecting players land on reveal screen
  let revealData = null
  if (round.status === 'closed') {
    const { data: rawAnswers } = await supabase
      .from('answers')
      .select('player_id, value, players(nickname)')
      .eq('round_id', round.id)

    revealData = {
      correctAnswer: question.answer,
      answers: ((rawAnswers ?? []) as Array<{ player_id: string; value: number; players: { nickname: string } }>)
        .map(a => ({
          playerId: a.player_id,
          nickname: a.players.nickname,
          value: a.value,
          delta: Math.abs(a.value - question.answer),
        }))
        .sort((a, b) => a.delta - b.delta),
    }
  }

  return (
    <div className="min-h-dvh">
      <GameScreen
        roomCode={roomCode}
        sessionHostId={session.host_id}
        initialRoundId={round.id}
        initialRoundNumber={round.round_number}
        initialQuestion={{
          id: question.id,
          text: question.text,
          timeLimit: question.time_limit,
          category: question.category,
        }}
        initialStartedAt={round.started_at}
        initialRevealData={revealData}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd quizknight && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd quizknight && git add "src/app/game/[roomCode]/page.tsx"
git commit -m "feat: add game page server component"
```

---

### Task 12: Update LobbyScreen

**Files:**
- Modify: `src/components/LobbyScreen.tsx`

Current `handleStart` just broadcasts without calling the API. We need it to call `POST /start` first, get the round data, then broadcast `game:started`. The broadcast listener event name must also change from `game:start` → `game:started`.

- [ ] **Step 1: Update handleStart and the broadcast listener**

In `src/components/LobbyScreen.tsx`, make two changes:

**Change 1** — Update the broadcast listener event name (line 43):
```typescript
// Before:
.on('broadcast', { event: 'game:start' }, () => {

// After:
.on('broadcast', { event: 'game:started' }, () => {
```

**Change 2** — Replace `handleStart` (lines 75–83):
```typescript
// Before:
async function handleStart() {
  if (players.length < MIN_PLAYERS || !isHost) return
  setStarting(true)
  channelRef.current?.send({
    type: 'broadcast',
    event: 'game:start',
    payload: {},
  })
}

// After:
async function handleStart() {
  if (players.length < MIN_PLAYERS || !isHost || !playerId) return
  setStarting(true)
  const res = await fetch(`/api/sessions/${roomCode}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId }),
  })
  if (!res.ok) {
    setStarting(false)
    return
  }
  channelRef.current?.send({
    type: 'broadcast',
    event: 'game:started',
    payload: {},
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd quizknight && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Run all tests to confirm nothing is broken**

```bash
cd quizknight && npx jest --no-coverage
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd quizknight && git add \
  src/hooks/useCountdown.ts \
  src/components/GameScreen.tsx \
  src/components/QuestionPanel.tsx \
  src/components/RevealPanel.tsx \
  "__tests__/hooks/useCountdown.test.ts" \
  src/components/LobbyScreen.tsx
git commit -m "feat: add game loop frontend (GameScreen, QuestionPanel, RevealPanel, useCountdown, LobbyScreen update)"
```

---

### Task 13: Seed questions and smoke test

The `questions` table is empty — the game can't start without data. Add a few seed questions to test end-to-end.

- [ ] **Step 1: Seed questions in Supabase SQL Editor**

```sql
INSERT INTO questions (text, answer, category, time_limit) VALUES
  ('In what year did the Berlin Wall fall?', 1989, 'history', 12),
  ('How many bones are in the adult human body?', 206, 'science', 12),
  ('In what year was the iPhone first released?', 2007, 'history', 10),
  ('What is the speed of light in km/s (rounded to nearest thousand)?', 300000, 'science', 15),
  ('In what year did World War II end?', 1945, 'history', 10),
  ('How many meters are in a mile (to nearest meter)?', 1609, 'geography', 12),
  ('In what year was Google founded?', 1998, 'history', 10),
  ('How many players are on a standard football (soccer) team?', 11, 'sports', 8),
  ('What is the boiling point of water in Celsius?', 100, 'science', 8),
  ('In what year did the Titanic sink?', 1912, 'history', 12);
```

- [ ] **Step 2: Manual end-to-end smoke test**

Open two browser tabs at `http://localhost:3000`.

Tab 1 (host):
1. Enter a nickname → Create Game
2. Note the room code

Tab 2 (player 2):
1. Enter a different nickname → Join Game → enter the room code

Tab 3 (player 3 — need 3 minimum):
1. Enter a third nickname → Join Game → enter the room code

Back in Tab 1 (host):
3. Click **Start Game**

Expected:
- All three tabs navigate to `/game/[roomCode]`
- Question appears with a countdown timer
- Each tab can enter a number and click SUBMIT
- After the timer runs out, all tabs show the reveal screen with ranked answers
- After 5 seconds, all tabs advance to the next question

- [ ] **Step 3: Final commit**

No new files — the seed SQL was run directly in Supabase. Nothing to commit after the smoke test passes.
