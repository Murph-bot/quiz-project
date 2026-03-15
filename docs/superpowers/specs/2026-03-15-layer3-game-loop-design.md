# QuizKnight — Layer 3: Game Loop Design

**Date:** 2026-03-15
**Scope:** Layer 3 of 5 — Game Loop (question screen → answer submission → reveal)
**Status:** Approved
**Builds on:** Layer 1–2 spec (`2026-03-14-foundation-lobby-design.md`)

---

## Overview

Layer 3 implements the core game loop: the host starts the game from the lobby, questions are presented one at a time with a server-driven countdown timer, players submit numeric guesses, and a reveal screen shows all answers ranked by closeness to the correct answer before auto-advancing to the next question after 5 seconds.

**Out of scope for Layer 3:** elimination logic, resurrection mechanic, spectator mode, sudden-death tiebreaker. These are Layer 4+.

---

## Game Flow

```
LOBBY → [Host clicks Start] → QUESTION SCREEN → [Timer expires / all answered]
      → REVEAL SCREEN → [5s auto-advance] → NEXT QUESTION → repeat
```

The game loop runs until stopped (end condition is Layer 4). Layer 3 loops indefinitely through questions.

---

## Database Schema Changes

Two new tables added via migration `002_game_loop.sql`:

### `rounds`
```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
session_id   uuid REFERENCES sessions(id) ON DELETE CASCADE
question_id  uuid REFERENCES questions(id)
round_number integer NOT NULL
started_at   timestamptz NOT NULL DEFAULT now()
status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed'))
```

### `answers`
```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
round_id     uuid REFERENCES rounds(id) ON DELETE CASCADE
player_id    uuid REFERENCES players(id) ON DELETE CASCADE
value        integer NOT NULL
submitted_at timestamptz NOT NULL DEFAULT now()
UNIQUE (round_id, player_id)
```

Indexes:
```sql
CREATE INDEX idx_rounds_session_id ON rounds(session_id);
CREATE INDEX idx_answers_round_id ON answers(round_id);
```

---

## API Routes

### `POST /api/sessions/[roomCode]/start`
Starts the game. Host only.

- Validates `playerId` in body, confirms player is host of this session
- Confirms session status is `lobby` (409 if already `active`)
- Picks one random question matching `session.category` (or any category if `'all'`)
- Creates first `rounds` row with `round_number = 1`
- Updates `sessions.status` to `'active'`
- Broadcasts `game:started` on `room:{roomCode}` with `{ roundId, question: { id, text, timeLimit }, startedAt }`
- Returns `{ roundId, question, startedAt }`

### `POST /api/sessions/[roomCode]/rounds/[roundId]/answer`
Submits a player's answer.

- Validates `playerId` and `value` (integer) in body
- Confirms round exists, belongs to session, and status is `'active'` (409 if closed)
- Inserts into `answers` (409 on duplicate — player already answered)
- Returns `{ ok: true }`

### `POST /api/sessions/[roomCode]/rounds/[roundId]/close`
Closes the round and triggers the reveal. Idempotent.

- If round status is already `'closed'`, returns 200 immediately (no-op, no second broadcast)
- Updates round status to `'closed'`
- Fetches all answers for this round
- Fetches correct answer from `questions`
- Ranks answers by `ABS(value - correct_answer)` ascending
- Broadcasts `round:closed` on `room:{roomCode}` with `{ correctAnswer, answers: [{ playerId, nickname, value, delta }] }`
- Returns `{ correctAnswer, answers }`

### `POST /api/sessions/[roomCode]/rounds/next`
Advances to the next question after the reveal. Called by host's client after 5s.

- Validates `playerId` is host
- Confirms current round is `'closed'` (409 if still active)
- Picks next random question excluding questions already used in this session (derived by querying `rounds` for all `question_id` values with this `session_id`)
- Creates new `rounds` row with `round_number` incremented
- Broadcasts `round:started` on `room:{roomCode}` with `{ roundId, question: { id, text, timeLimit }, startedAt }`
- Returns `{ roundId, question, startedAt }`

---

## Realtime Events

All events use Supabase Realtime **Broadcast** on channel `room:{roomCode}` — same channel as the lobby presence.

| Event | Payload | Effect |
|---|---|---|
| `game:started` | `{ roundId, question, startedAt }` | All clients navigate to `/game/[roomCode]` |
| `round:started` | `{ roundId, question, startedAt }` | All clients enter `answering` phase |
| `round:closed` | `{ correctAnswer, answers[] }` | All clients enter `reveal` phase |

---

## Pages & Components

### `/game/[roomCode]` (server component)
- Fetches session server-side; redirects to `/lobby/[roomCode]` if status is `'lobby'`, to `/` if `'finished'`
- Fetches the current round (active or closed) and its question
- If round is `'closed'`, also fetches all answers and the correct answer so reconnecting players land on the reveal screen instead of a blank answering screen
- Passes `{ round, question, revealData | null }` as initial props to `<GameScreen>`

### `GameScreen.tsx` (client component)
- Owns the Supabase Realtime subscription for `round:started` and `round:closed`
- Manages phase state: `'answering' | 'waiting' | 'reveal'`
  - `answering` — player hasn't submitted yet, countdown running
  - `waiting` — player submitted, waiting for round to close
  - `reveal` — round closed, showing results
- On `round:closed` event: transitions to `reveal`, starts 5s auto-advance timer
- After 5s: if host, calls `POST /rounds/next`; all clients transition back to `answering` on `round:started`
- When countdown hits zero: calls `POST /close` (client race — idempotent)

### `QuestionPanel.tsx` (presentational)
Props: `question`, `timeLimit`, `startedAt`, `onSubmit`, `phase`

- Displays question text, category badge, round number
- Countdown timer driven by `useCountdown(deadline)`
- Progress bar (shrinks linearly from full to zero)
- Numeric input + Submit button (disabled after submit or when phase is `waiting`)
- Input accepts integers only

### `RevealPanel.tsx` (presentational)
Props: `correctAnswer`, `answers`, `autoAdvanceIn`

- Correct answer banner at top
- Ranked list: rank medal (🥇🥈🥉), nickname, submitted value, delta ("exact!" / "off by N")
- "Next question in Xs" ticker at bottom
- No elimination UI in Layer 3 — ranking only

### `useCountdown.ts` (hook)
```ts
useCountdown(deadlineMs: number): { secondsLeft: number, isExpired: boolean }
```
- Computes `secondsLeft = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))`
- Updates every 500ms via `setInterval`
- Returns `isExpired = true` when `secondsLeft === 0`
- Cleans up interval on unmount

---

## Timer Design

The server records `started_at` (UTC timestamp) when creating a round. Each question has a `time_limit` in seconds stored in the `questions` table.

Clients compute the deadline:
```ts
const deadlineMs = new Date(startedAt).getTime() + timeLimit * 1000
```

This means all clients share the same deadline regardless of when they received the broadcast. Minor network latency (< 1s) is acceptable for a party game.

When `useCountdown` returns `isExpired: true`, `GameScreen` calls `POST /close`. The first call wins; subsequent calls are silently no-oped by the idempotency check.

**Client race is intentional:** Every connected client calls `POST /close` when their timer expires — not just the host. This is deliberate: if the host disconnects, the round still closes. The idempotency guard on the server ensures only the first caller triggers the broadcast and DB write. `POST /next` (after the reveal) is host-only because advancing to the next question is a single intentional action.

---

## Error Handling

| Scenario | Handling |
|---|---|
| Player submits after round closes | `POST /answer` returns 409; client silently ignores (already in reveal) |
| Player submits twice | `UNIQUE` constraint → 409; client shows "already submitted" |
| `POST /close` called on closed round | Returns 200, no broadcast, no DB write |
| `POST /next` called with round still active | Returns 409 |
| Player reconnects mid-game | GET session on load → current round + phase restored |
| No questions left in category | `POST /start` or `/next` returns 409 with `{ error: 'No questions available' }` |

---

## Testing

Jest unit tests for every API route, following Layers 1–2 patterns (mock `createServerClient`).

**`POST /start`:**
- 403 if player is not host
- 409 if session already active
- 200 with round data on success

**`POST /answer`:**
- 400 if value is missing or non-integer
- 409 if round is already closed
- 409 if player already answered (duplicate)
- 200 on success

**`POST /close`:**
- 200 (no-op) if already closed — no second broadcast
- 200 with ranked answers on first close
- Correct ranking: answers sorted by ABS(value - correct) ascending

**`POST /next`:**
- 403 if not host
- 409 if current round still active
- 200 with new round data

**`useCountdown` hook:**
- Returns correct `secondsLeft` given a future deadline
- Returns 0 and `isExpired: true` when past deadline
- Cleans up interval on unmount

---

## File Structure

```
src/
  app/
    api/
      sessions/[roomCode]/
        start/route.ts
        rounds/
          [roundId]/
            answer/route.ts
            close/route.ts
          next/route.ts
    game/
      [roomCode]/
        page.tsx
  components/
    GameScreen.tsx
    QuestionPanel.tsx
    RevealPanel.tsx
  hooks/
    useCountdown.ts
supabase/
  migrations/
    002_game_loop.sql
__tests__/
  api/
    sessions-start.test.ts
    sessions-answer.test.ts
    sessions-close.test.ts
    sessions-next.test.ts
  hooks/
    useCountdown.test.ts
```
