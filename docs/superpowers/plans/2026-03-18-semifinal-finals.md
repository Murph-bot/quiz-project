# Semi-Finals & Finals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When 4 players remain in a normal QuizKnight game, automatically transition to a knockout bracket: two best-of-3 semi-finals followed by a best-of-5 final.

**Architecture:** Bracket state is stored as JSONB in the sessions table alongside a `phase` column. The existing `close` route handles all bracket logic (win counting, phase transitions). GameScreen gains new phases (`bracket`, `match-result`) and new broadcast events wire everything together.

**Tech Stack:** Next.js App Router, Supabase Postgres + Realtime, React 19, TypeScript, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-18-semifinal-finals-design.md`

---

## File Map

### New files
- `supabase/migrations/004_bracket.sql` — adds `phase` + `bracket` columns to sessions
- `src/app/api/sessions/[roomCode]/bracket/route.ts` — GET bracket state for reconnects
- `src/components/BracketScreen.tsx` — full-screen bracket reveal before SF1
- `src/components/MatchScoreBar.tsx` — live score banner during match rounds
- `src/components/MatchResultScreen.tsx` — SF/Final result screen

### Modified files
- `src/types/index.ts` — add BracketMatch, BracketState, extended Phase type
- `src/app/api/sessions/[roomCode]/rounds/[roundId]/close/route.ts` — bracket generation + match win logic
- `src/components/GameScreen.tsx` — new phases, bracket broadcasts, score state
- `src/components/QuestionPanel.tsx` — accept MatchScoreBar as optional slot
- `src/components/SpectatorScreen.tsx` — show live match info during bracket phase

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/004_bracket.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/004_bracket.sql
ALTER TABLE sessions ADD COLUMN phase TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE sessions ADD COLUMN bracket JSONB;
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Open Supabase dashboard → SQL Editor → New query. Paste and run the migration. Verify the `sessions` table now has `phase` and `bracket` columns in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/004_bracket.sql
git commit -m "feat: add phase and bracket columns to sessions"
```

---

## Task 2: Type Definitions

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add bracket types**

Add to `src/types/index.ts`:

```typescript
export interface BracketMatch {
  p1id: string
  p1: string
  p2id: string
  p2: string
  wins: [number, number] // [p1wins, p2wins]
}

export interface BracketState {
  sf1: BracketMatch
  sf2: BracketMatch
  currentSF: 1 | 2 | null // null = in final
  finalists: string[] // player IDs [winner_sf1_id, winner_sf2_id]
  finalWins?: [number, number] // [p1wins, p2wins] during Final
}

export type GamePhase = 'normal' | 'semifinal' | 'final'

export type UIPhase =
  | 'answering'
  | 'waiting'
  | 'reveal'
  | 'spectating'
  | 'bracket'
  | 'match-result'
  | 'winner'
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/sotirios/Documents/Claude_Project_quizknight/quizknight && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add bracket and match phase types"
```

---

## Task 3: Bracket GET Endpoint

**Files:**
- Create: `src/app/api/sessions/[roomCode]/bracket/route.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params
  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }
  const supabase = createServerClient()
  const { data: session, error } = await supabase
    .from('sessions')
    .select('phase, bracket')
    .eq('room_code', roomCode)
    .single()
  if (error || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  return NextResponse.json({ phase: session.phase, bracket: session.bracket })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sessions/[roomCode]/bracket/route.ts
git commit -m "feat: add GET /bracket endpoint for reconnects"
```

---

## Task 4: Update close/route.ts — Bracket Generation

**Files:**
- Modify: `src/app/api/sessions/[roomCode]/rounds/[roundId]/close/route.ts`

- [ ] **Step 1: Read the current file**

Read `src/app/api/sessions/[roomCode]/rounds/[roundId]/close/route.ts` in full before editing.

- [ ] **Step 2: Update the session select to include phase and bracket**

Change the session query from:
```typescript
.select('id')
```
to:
```typescript
.select('id, phase, bracket')
```

- [ ] **Step 3: Add bracket generation logic after normal eliminations**

After the existing `aliveCount` check block (after the `gameOver` / `winner` detection), add:

```typescript
let bracketReady = false
let bracket = null

// Transition to bracket mode when exactly 4 players remain (normal phase only)
if ((session as any).phase === 'normal' && (aliveCount ?? 0) === 4 && !gameOver) {
  // Rank the 4 survivors by total delta across all rounds (lower = better)
  const { data: rankings } = await supabase
    .from('answers')
    .select('player_id, value, rounds!inner(session_id, question_id), players!inner(nickname, is_alive)')
    .eq('rounds.session_id', session.id)
    .eq('players.is_alive', true)

  // Build per-player total delta map using correct answers
  const { data: roundsWithAnswers } = await supabase
    .from('rounds')
    .select('question_id, answers(player_id, value), questions(answer)')
    .eq('session_id', session.id)

  const totalDelta: Record<string, number> = {}
  for (const round of (roundsWithAnswers ?? []) as any[]) {
    const correct = round.questions?.answer ?? 0
    for (const ans of round.answers ?? []) {
      totalDelta[ans.player_id] = (totalDelta[ans.player_id] ?? 0) + Math.abs(ans.value - correct)
    }
  }

  const { data: alivePlayers } = await supabase
    .from('players')
    .select('id, nickname')
    .eq('session_id', session.id)
    .eq('is_alive', true)

  const ranked = ((alivePlayers ?? []) as Array<{ id: string; nickname: string }>)
    .sort((a, b) => (totalDelta[a.id] ?? 0) - (totalDelta[b.id] ?? 0))
  // ranked[0] = best (#1), ranked[3] = worst (#4)

  bracket = {
    sf1: { p1id: ranked[0].id, p1: ranked[0].nickname, p2id: ranked[3].id, p2: ranked[3].nickname, wins: [0, 0] },
    sf2: { p1id: ranked[1].id, p1: ranked[1].nickname, p2id: ranked[2].id, p2: ranked[2].nickname, wins: [0, 0] },
    currentSF: 1,
    finalists: [],
  }

  await supabase
    .from('sessions')
    .update({ phase: 'semifinal', bracket })
    .eq('id', session.id)

  bracketReady = true
}
```

- [ ] **Step 4: Add bracketReady and bracket to the return JSON**

```typescript
return NextResponse.json({
  correctAnswer,
  answers,
  eliminated,
  winner,
  gameOver,
  wasAlreadyClosed: false,
  bracketReady,
  bracket,
})
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add 'src/app/api/sessions/[roomCode]/rounds/[roundId]/close/route.ts'
git commit -m "feat: detect 4 survivors and generate bracket in close route"
```

---

## Task 5: Update close/route.ts — Match Win Logic

**Files:**
- Modify: `src/app/api/sessions/[roomCode]/rounds/[roundId]/close/route.ts`

- [ ] **Step 1: Add semifinal win counting logic**

Add this block BEFORE the normal elimination logic (check `session.phase` at the top of the handler to branch):

```typescript
// --- BRACKET PHASE LOGIC ---
if ((session as any).phase === 'semifinal' || (session as any).phase === 'final') {
  const bracket = (session as any).bracket as any
  const isFinal = (session as any).phase === 'final'
  const winsToWin = isFinal ? 3 : 2

  // Identify the two competing players
  let p1id: string, p2id: string
  if (isFinal) {
    p1id = bracket.finalists[0]
    p2id = bracket.finalists[1]
  } else {
    const sf = bracket.currentSF === 1 ? bracket.sf1 : bracket.sf2
    p1id = sf.p1id
    p2id = sf.p2id
  }

  // Get their answers for this round
  const { data: rawAnswers } = await supabase
    .from('answers')
    .select('player_id, value, players(nickname)')
    .eq('round_id', roundId)
    .in('player_id', [p1id, p2id])

  const { data: question } = await supabase
    .from('questions')
    .select('answer')
    .eq('id', round.question_id)
    .single()

  const correctAnswer = question?.answer ?? 0

  type AnswerRow = { player_id: string; value: number; players: { nickname: string } }
  const answerMap = Object.fromEntries(
    ((rawAnswers ?? []) as unknown as AnswerRow[]).map(a => [
      a.player_id,
      { value: a.value, delta: Math.abs(a.value - correctAnswer), nickname: a.players.nickname },
    ])
  )

  const p1ans = answerMap[p1id]
  const p2ans = answerMap[p2id]

  // Build ranked answers for reveal (all players see it)
  const allAnswers = await supabase
    .from('answers')
    .select('player_id, value, players(nickname)')
    .eq('round_id', roundId)

  const answers = ((allAnswers.data ?? []) as unknown as AnswerRow[])
    .map(a => ({
      playerId: a.player_id,
      nickname: a.players.nickname,
      value: a.value as number | null,
      delta: Math.abs(a.value - correctAnswer),
      noAnswer: false,
    }))
    .sort((a, b) => a.delta - b.delta)

  // Mark round as closed
  await supabase.from('rounds').update({ status: 'closed' }).eq('id', roundId)

  // Handle missing answer (treat as infinite delta)
  const p1delta = p1ans?.delta ?? Number.MAX_SAFE_INTEGER
  const p2delta = p2ans?.delta ?? Number.MAX_SAFE_INTEGER

  // Tie — replay
  if (p1delta === p2delta) {
    return NextResponse.json({
      correctAnswer,
      answers,
      eliminated: [],
      winner: null,
      gameOver: false,
      wasAlreadyClosed: false,
      isTie: true,
      bracketReady: false,
      bracket: bracket,
    })
  }

  // Award win
  const p1won = p1delta < p2delta
  const sfKey = isFinal ? null : (bracket.currentSF === 1 ? 'sf1' : 'sf2')
  if (!isFinal && sfKey) {
    if (p1won) bracket[sfKey].wins[0]++
    else bracket[sfKey].wins[1]++
  } else {
    // final
    if (p1won) bracket.finalWins = [(bracket.finalWins?.[0] ?? 0) + 1, bracket.finalWins?.[1] ?? 0]
    else bracket.finalWins = [bracket.finalWins?.[0] ?? 0, (bracket.finalWins?.[1] ?? 0) + 1]
  }

  const p1wins = isFinal ? bracket.finalWins[0] : bracket[sfKey!].wins[0]
  const p2wins = isFinal ? bracket.finalWins[1] : bracket[sfKey!].wins[1]
  const matchWinnerId = p1wins >= winsToWin ? p1id : p2wins >= winsToWin ? p2id : null
  const matchWinnerNickname = matchWinnerId
    ? (matchWinnerId === p1id ? (isFinal ? bracket.finalists[0] : bracket[sfKey!].p1) : (isFinal ? bracket.finalists[1] : bracket[sfKey!].p2))
    : null

  // Resolve match winner nickname properly
  const winnerNickname = matchWinnerId === p1id
    ? (p1ans?.nickname ?? '')
    : (p2ans?.nickname ?? '')

  let sfComplete = false
  let finalReady = false
  let gameOver = false
  let gameWinner = null

  if (matchWinnerId) {
    if (isFinal) {
      // Game over
      gameOver = true
      gameWinner = { playerId: matchWinnerId, nickname: winnerNickname }
      await supabase.from('sessions').update({ status: 'finished', winner_id: matchWinnerId, bracket }).eq('id', session.id)
    } else {
      sfComplete = true
      bracket.finalists.push(matchWinnerId)
      if (bracket.finalists.length === 2) {
        // Both SFs done — start final
        bracket.currentSF = null
        await supabase.from('sessions').update({ phase: 'final', bracket }).eq('id', session.id)
        finalReady = true
      } else {
        // Advance to SF2
        bracket.currentSF = 2
        await supabase.from('sessions').update({ bracket }).eq('id', session.id)
      }
    }
  } else {
    // Match continues — save updated wins
    await supabase.from('sessions').update({ bracket }).eq('id', session.id)
  }

  return NextResponse.json({
    correctAnswer,
    answers,
    eliminated: [],
    winner: gameWinner,
    gameOver,
    wasAlreadyClosed: false,
    isTie: false,
    sfComplete,
    finalReady,
    bracket,
    matchWinnerId,
    matchWinnerNickname: winnerNickname,
    bracketReady: false,
  })
}
// --- END BRACKET PHASE LOGIC ---
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add 'src/app/api/sessions/[roomCode]/rounds/[roundId]/close/route.ts'
git commit -m "feat: add semifinal and final win logic to close route"
```

---

## Task 6: BracketScreen Component

**Files:**
- Create: `src/components/BracketScreen.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useEffect, useState } from 'react'
import type { BracketState } from '@/types'

interface Props {
  bracket: BracketState
  myPlayerId: string
  onReady: () => void
}

export function BracketScreen({ bracket, myPlayerId, onReady }: Props) {
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(s => {
        if (s <= 1) { clearInterval(t); onReady(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [onReady])

  const isInSF1 = bracket.sf1.p1id === myPlayerId || bracket.sf1.p2id === myPlayerId
  const isInSF2 = bracket.sf2.p1id === myPlayerId || bracket.sf2.p2id === myPlayerId

  function MatchCard({ match, label, highlighted }: { match: typeof bracket.sf1; label: string; highlighted: boolean }) {
    return (
      <div className={`bg-white rounded-2xl shadow-md p-4 ${highlighted ? 'ring-2 ring-orange-400' : ''}`}>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{label}</p>
        <div className="flex items-center justify-between gap-3">
          <span className="font-black text-gray-900 text-lg">{match.p1}</span>
          <span className="text-orange-500 font-black text-sm">VS</span>
          <span className="font-black text-gray-900 text-lg">{match.p2}</span>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">Best of 3</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-4">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="text-center">
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1">Semi-Finals</p>
          <h1 className="text-3xl font-black text-white">⚔️ The Bracket</h1>
          <p className="text-white/50 text-sm mt-1">4 players remain</p>
        </div>

        <MatchCard match={bracket.sf1} label="Semi-Final 1" highlighted={isInSF1} />
        <MatchCard match={bracket.sf2} label="Semi-Final 2" highlighted={isInSF2} />

        <div className="bg-white/10 rounded-2xl p-4 text-center">
          <p className="text-white/60 text-xs uppercase tracking-widest mb-1">Final</p>
          <p className="text-white font-black">Winner SF1 vs Winner SF2</p>
          <p className="text-white/40 text-xs mt-1">Best of 5</p>
        </div>

        <p className="text-center text-white/50 text-sm">
          {isInSF1 ? '⚡ You play in Semi-Final 1' : isInSF2 ? '⚡ You play in Semi-Final 2' : '👀 You watch Semi-Final 1 first'}
        </p>
        <p className="text-center text-white/40 text-xs">Starting in {countdown}s...</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/BracketScreen.tsx
git commit -m "feat: add BracketScreen component"
```

---

## Task 7: MatchScoreBar Component

**Files:**
- Create: `src/components/MatchScoreBar.tsx`

- [ ] **Step 1: Create the component**

```typescript
interface Props {
  p1: string
  p2: string
  wins: [number, number]
  matchLabel: string // e.g. "Semi-Final 1 · Best of 3"
  winsToWin: number
}

export function MatchScoreBar({ p1, p2, wins, matchLabel, winsToWin }: Props) {
  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-black/70 backdrop-blur-sm px-4 py-2 flex items-center justify-between">
      <span className="text-white font-black text-sm">{p1}</span>
      <div className="flex flex-col items-center">
        <span className="text-white font-black text-lg">{wins[0]} – {wins[1]}</span>
        <span className="text-white/50 text-xs">{matchLabel}</span>
      </div>
      <span className="text-white font-black text-sm">{p2}</span>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/MatchScoreBar.tsx
git commit -m "feat: add MatchScoreBar component"
```

---

## Task 8: MatchResultScreen Component

**Files:**
- Create: `src/components/MatchResultScreen.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useEffect, useState } from 'react'

interface Props {
  winnerNickname: string
  matchLabel: string // "Semi-Final 1" | "Semi-Final 2"
  finalScore: string // "2 – 0"
  nextLabel: string  // "Semi-Final 2 up next" | "Final up next"
  onContinue: () => void
}

export function MatchResultScreen({ winnerNickname, matchLabel, finalScore, nextLabel, onContinue }: Props) {
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(s => {
        if (s <= 1) { clearInterval(t); onContinue(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [onContinue])

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-4">
      <div className="w-full max-w-sm flex flex-col gap-5 text-center">
        <p className="text-white/60 text-xs font-bold uppercase tracking-widest">{matchLabel} Result</p>
        <div className="bg-white rounded-2xl shadow-md p-6">
          <div className="text-5xl mb-3">🏆</div>
          <p className="text-gray-400 text-sm mb-1">Winner</p>
          <p className="text-orange-500 font-black text-3xl">{winnerNickname}</p>
          <p className="text-gray-400 text-sm mt-3">{finalScore}</p>
        </div>
        <div className="bg-white/10 rounded-2xl p-4">
          <p className="text-white font-bold">{nextLabel}</p>
        </div>
        <p className="text-white/40 text-sm">Continuing in {countdown}s...</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/MatchResultScreen.tsx
git commit -m "feat: add MatchResultScreen component"
```

---

## Task 9: GameScreen — Bracket State & Broadcasts

**Files:**
- Modify: `src/components/GameScreen.tsx`

- [ ] **Step 1: Read the full GameScreen file before editing**

Read `src/components/GameScreen.tsx` in full.

- [ ] **Step 2: Import new components and types**

Add imports at the top:
```typescript
import { BracketScreen } from '@/components/BracketScreen'
import { MatchScoreBar } from '@/components/MatchScoreBar'
import { MatchResultScreen } from '@/components/MatchResultScreen'
import type { BracketState } from '@/types'
```

- [ ] **Step 3: Add bracket state variables**

```typescript
const [bracketData, setBracketData] = useState<BracketState | null>(null)
const [matchWins, setMatchWins] = useState<[number, number]>([0, 0])
const [currentMatchPhase, setCurrentMatchPhase] = useState<'sf1' | 'sf2' | 'final' | null>(null)
const [matchResultData, setMatchResultData] = useState<{
  winnerNickname: string
  matchLabel: string
  finalScore: string
  nextLabel: string
} | null>(null)
const [isMatchSpectator, setIsMatchSpectator] = useState(false)
```

- [ ] **Step 4: Handle bracket:ready broadcast**

In the channel subscription block, add a new broadcast handler:

```typescript
.on('broadcast', { event: 'bracket:ready' }, ({ payload }) => {
  setBracketData(payload.bracket)
  setCurrentMatchPhase('sf1')
  setPhase('bracket')
})
```

- [ ] **Step 5: Handle match:point broadcast**

```typescript
.on('broadcast', { event: 'match:point' }, ({ payload }) => {
  setMatchWins(payload.wins)
  setBracketData(payload.bracket)
})
```

- [ ] **Step 6: Handle match:complete broadcast**

```typescript
.on('broadcast', { event: 'match:complete' }, ({ payload }) => {
  setBracketData(payload.bracket)
  setMatchResultData({
    winnerNickname: payload.matchWinnerNickname,
    matchLabel: payload.matchLabel,
    finalScore: payload.finalScore,
    nextLabel: payload.nextLabel,
  })
  setPhase('match-result')
})
```

- [ ] **Step 7: Handle tie:replay broadcast**

```typescript
.on('broadcast', { event: 'tie:replay' }, ({ payload }) => {
  setRevealData({ correctAnswer: payload.correctAnswer, answers: payload.answers })
  setPhase('reveal')
})
```

- [ ] **Step 8: Handle final:ready broadcast**

```typescript
.on('broadcast', { event: 'final:ready' }, ({ payload }) => {
  setBracketData(payload.bracket)
  setCurrentMatchPhase('final')
  setMatchWins([0, 0])
  setMatchResultData({
    winnerNickname: payload.matchWinnerNickname,
    matchLabel: payload.matchLabel,
    finalScore: payload.finalScore,
    nextLabel: 'The Final is next!',
  })
  setPhase('match-result')
})
```

- [ ] **Step 9: Update the close round handler to emit bracket broadcasts**

In the `.then(data => { ... })` block of the close round fetch, add after the existing `wasAlreadyClosed` check:

```typescript
if (data.bracketReady && data.bracket) {
  setBracketData(data.bracket)
  setCurrentMatchPhase('sf1')
  setPhase('bracket')
  channelRef.current?.send({
    type: 'broadcast',
    event: 'bracket:ready',
    payload: { bracket: data.bracket },
  })
  return
}

if (data.isTie) {
  // Show reveal to all players and let host auto-advance
  setRevealData({ correctAnswer: data.correctAnswer, answers: data.answers })
  setPhase('reveal')
  // Broadcast tie so non-host clients also see the reveal
  channelRef.current?.send({
    type: 'broadcast',
    event: 'tie:replay',
    payload: { correctAnswer: data.correctAnswer, answers: data.answers },
  })
  // Host auto-calls next round after 3 seconds (same as normal reveal auto-advance)
  if (isHost) {
    setTimeout(() => {
      fetch(`/api/sessions/${roomCode}/rounds/next`, { method: 'POST' })
        .then(r => r.json())
        .then(nextData => {
          channelRef.current?.send({
            type: 'broadcast',
            event: 'next:round',
            payload: nextData,
          })
        })
    }, 3000)
  }
  return
}

if (data.sfComplete || data.finalReady) {
  const sf = bracketData?.currentSF
  const sfLabel = sf === 1 ? 'Semi-Final 1' : 'Semi-Final 2'
  const wins = data.bracket?.[`sf${sf}`]?.wins ?? [0, 0]
  const finalScore = `${wins[0]} – ${wins[1]}`
  const nextLabel = data.finalReady ? 'The Final is next!' : 'Semi-Final 2 up next'

  setBracketData(data.bracket)
  setMatchWins([0, 0])

  const eventName = data.finalReady ? 'final:ready' : 'match:complete'
  const payload = {
    bracket: data.bracket,
    matchWinnerNickname: data.matchWinnerNickname,
    matchLabel: sfLabel,
    finalScore,
    nextLabel,
  }
  setMatchResultData({ winnerNickname: data.matchWinnerNickname, matchLabel: sfLabel, finalScore, nextLabel })
  setPhase('match-result')
  channelRef.current?.send({ type: 'broadcast', event: eventName, payload })
  return
}

if (!data.wasAlreadyClosed && (data.bracket || currentMatchPhase)) {
  // Match continues — update score
  const sf = data.bracket?.currentSF
  const sfKey = sf === 1 ? 'sf1' : sf === 2 ? 'sf2' : null
  const newWins: [number, number] = sfKey
    ? data.bracket[sfKey].wins
    : [data.bracket?.finalWins?.[0] ?? 0, data.bracket?.finalWins?.[1] ?? 0]
  setMatchWins(newWins)
  setBracketData(data.bracket)
  channelRef.current?.send({ type: 'broadcast', event: 'match:point', payload: { wins: newWins, bracket: data.bracket } })
  return // prevent normal reveal flow from also executing
}
```

- [ ] **Step 10: Determine isMatchSpectator each render**

Add a derived variable before the return statement:

```typescript
const amICompeting = bracketData
  ? currentMatchPhase === 'sf1'
    ? bracketData.sf1.p1id === playerId || bracketData.sf1.p2id === playerId
    : currentMatchPhase === 'sf2'
    ? bracketData.sf2.p1id === playerId || bracketData.sf2.p2id === playerId
    : bracketData.finalists.includes(playerId ?? '')
  : true
```

- [ ] **Step 11: Add bracket and match-result phase renders**

In the return block, add before the existing phase checks:

```typescript
if (phase === 'bracket' && bracketData) {
  return (
    <BracketScreen
      bracket={bracketData}
      myPlayerId={playerId ?? ''}
      onReady={() => {
        // All players advance their own phase when the countdown hits 0
        setPhase(amICompeting ? 'answering' : 'spectating')
        // Only host also triggers the next round API
        if (isHost) {
          fetch(`/api/sessions/${roomCode}/rounds/next`, { method: 'POST' })
            .then(r => r.json())
            .then(nextData => {
              channelRef.current?.send({
                type: 'broadcast',
                event: 'next:round',
                payload: nextData,
              })
            })
        }
      }}
    />
  )
}

if (phase === 'match-result' && matchResultData) {
  return (
    <MatchResultScreen
      winnerNickname={matchResultData.winnerNickname}
      matchLabel={matchResultData.matchLabel}
      finalScore={matchResultData.finalScore}
      nextLabel={matchResultData.nextLabel}
      onContinue={() => {
        setMatchResultData(null)
        setPhase(amICompeting ? 'answering' : 'spectating')
      }}
    />
  )
}
```

- [ ] **Step 12: Add MatchScoreBar when in bracket phase rounds**

In the QuestionPanel render, wrap it:

```typescript
{(phase === 'answering' || phase === 'waiting') && bracketData && currentMatchPhase && (
  <>
    {(() => {
      const sf = currentMatchPhase === 'sf1' ? bracketData.sf1
        : currentMatchPhase === 'sf2' ? bracketData.sf2 : null
      const winsToWin = currentMatchPhase === 'final' ? 3 : 2
      const matchLabel = currentMatchPhase === 'final'
        ? 'Final · Best of 5'
        : currentMatchPhase === 'sf1'
        ? 'Semi-Final 1 · Best of 3'
        : 'Semi-Final 2 · Best of 3'
      const p1 = sf ? sf.p1 : bracketData.finalists[0] ?? ''
      const p2 = sf ? sf.p2 : bracketData.finalists[1] ?? ''
      return <MatchScoreBar p1={p1} p2={p2} wins={matchWins} matchLabel={matchLabel} winsToWin={winsToWin} />
    })()}
  </>
)}
```

- [ ] **Step 13: In spectating phase during bracket mode, show question read-only**

When `phase === 'spectating'` and `bracketData`, show MatchScoreBar + QuestionPanel with `isWaiting={true}` so spectators see the question and score but can't answer:

```typescript
if (phase === 'spectating' && bracketData && currentMatchPhase) {
  const sf = currentMatchPhase === 'sf1' ? bracketData.sf1
    : currentMatchPhase === 'sf2' ? bracketData.sf2 : null
  const matchLabel = currentMatchPhase === 'final'
    ? 'Final · Best of 5'
    : currentMatchPhase === 'sf1'
    ? 'Semi-Final 1 · Best of 3'
    : 'Semi-Final 2 · Best of 3'
  const winsToWin = currentMatchPhase === 'final' ? 3 : 2
  const p1 = sf ? sf.p1 : bracketData.finalists[0] ?? ''
  const p2 = sf ? sf.p2 : bracketData.finalists[1] ?? ''
  return (
    <>
      <MatchScoreBar p1={p1} p2={p2} wins={matchWins} matchLabel={matchLabel} winsToWin={winsToWin} />
      <QuestionPanel
        roundNumber={roundNumber}
        question={question}
        startedAt={startedAt}
        isWaiting={true}
        isGracePeriod={false}
        onSubmit={() => {}}
      />
    </>
  )
}
```

- [ ] **Step 14: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 15: Commit**

```bash
git add src/components/GameScreen.tsx
git commit -m "feat: add bracket phases and broadcasts to GameScreen"
```

---

## Task 10: Manual End-to-End Test

- [ ] **Step 1: Start dev server**

```bash
cd /Users/sotirios/Documents/Claude_Project_quizknight/quizknight && npm run dev
```

- [ ] **Step 2: Test with 4 browser tabs**

Open 4 browser windows at `localhost:3000`. Create a game, join 3 more players. Start the game and play rounds until 4 players remain. Verify:
- BracketScreen appears for all 4 players
- SF1 starts with only 2 players able to answer
- Score bar updates after each round
- Ties replay correctly
- SF1 winner advances, SF2 starts
- Final starts correctly
- Final winner shown on WinnerScreen

- [ ] **Step 3: Final commit and push**

```bash
git add -A
git commit -m "feat: complete semi-finals and finals bracket mode"
git push origin main
```
