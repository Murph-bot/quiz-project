# Semi-Finals & Finals Mode — Design Spec

## Overview

When 4 players remain in a normal QuizKnight game, the elimination format ends and a knockout bracket begins. Two 1v1 semi-finals (best of 3) are played sequentially, then the two winners face each other in a final (best of 5). All 4 players watch every match.

---

## Trigger

After any normal round closes and exactly 4 players are alive, the server transitions the session to bracket mode. This check happens at the end of `POST /rounds/[roundId]/close`.

---

## Bracket Pairing

Players are ranked by their total delta across all normal rounds (lower = better). Pairings:
- **SF1**: Rank #1 (best) vs Rank #4 (worst)
- **SF2**: Rank #2 vs Rank #3

Rationale: rewards consistent performance without complex UI.

---

## Match Format

| Phase | Format | Win condition |
|-------|--------|---------------|
| Semi-final 1 | Best of 3 | First to 2 round wins |
| Semi-final 2 | Best of 3 | First to 2 round wins |
| Final | Best of 5 | First to 3 round wins |

A **round win** = closest answer to the correct integer. Ties (equal delta) replay with a new question — no point awarded.

---

## Who Plays vs Who Watches

- During SF1: SF1 players answer. SF2 players watch (see question + reveal, cannot submit).
- During SF2: SF2 players answer. SF1 players watch.
- During Final: Finalists answer. Losers watch.
- All 4 players see every reveal screen with full answer breakdown and running score.

---

## Database Changes

Two new columns on `sessions`:

```sql
ALTER TABLE sessions ADD COLUMN phase TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE sessions ADD COLUMN bracket JSONB;
```

`bracket` JSON structure:
```json
{
  "sf1": { "p1id": "uuid", "p1": "Alice", "p2id": "uuid", "p2": "Bob", "wins": [0, 0] },
  "sf2": { "p1id": "uuid", "p1": "Charlie", "p2id": "uuid", "p2": "Dan", "wins": [0, 0] },
  "currentSF": 1,
  "finalists": []
}
```

`phase` values: `'normal'` | `'semifinal'` | `'final'`

---

## API Changes

### `POST /rounds/[roundId]/close`

**Normal phase:**
- Existing elimination logic unchanged.
- After elimination, count alive players. If exactly 4 → compute bracket, set `phase = 'semifinal'`, persist bracket, return `{ bracketReady: true, bracket }`.

**Semifinal phase:**
- Do NOT eliminate anyone.
- Find which SF is active (`bracket.currentSF`). Identify the two competing players.
- Compare their deltas. Award win to closer player. If tie → return `{ isTie: true }` (client replays immediately).
- Update `bracket.sfN.wins` in DB.
- If a player reaches 2 wins:
  - Add winner to `bracket.finalists`.
  - If `currentSF === 1` → set `currentSF = 2`, return `{ sfComplete: true, sfWinner, nextSF: 2 }`.
  - If `currentSF === 2` → set `phase = 'final'`, return `{ sfComplete: true, sfWinner, finalReady: true, finalists }`.
- Otherwise → return `{ matchContinues: true, wins: [...] }`.

**Final phase:**
- Same win logic. First player to reach 3 wins → set session `status = 'finished'`, `winner_id`, return `{ gameOver: true, winner }`.

### `POST /rounds/next`

No logic change needed. The close route handles all bracket state. Next route just picks a question and creates a round as before.

### `GET /sessions/[roomCode]/bracket` *(new)*

Returns current bracket state for reconnecting players.

---

## New UI Components

### `BracketScreen`
Shown to all 4 players after normal phase ends and before SF1 starts. Displays bracket layout with player names and pairings. Auto-transitions to SF1 after 5 seconds.

### `MatchScoreBar`
Persistent banner during match rounds showing: player names, current score (e.g. `Alice 1 – 0 Bob`), match type (Semi-Final 1 · Best of 3). Visible to all 4 players.

### `MatchResultScreen`
Shown after each SF ends. Shows winner name, final score, and who advances. Auto-transitions after 5 seconds.

### Updated `SpectatorScreen`
During bracket phase, non-competing players are shown the question in read-only mode and see the full reveal. The SpectatorScreen is replaced by the standard QuestionPanel (read-only) + RevealPanel for spectating players.

---

## GameScreen Phase Extensions

Current phases: `answering | waiting | reveal | spectating | winner`

New phases added: `bracket | match-result`

New state: `bracketData`, `matchScore`, `currentMatchPhase` ('sf1' | 'sf2' | 'final')

New broadcasts:
- `bracket:ready` — triggers BracketScreen for all players
- `match:point` — updates score bar live
- `match:complete` — triggers MatchResultScreen
- `final:ready` — triggers transition to final

---

## Round 30 Limit

The 30-round sudden-death limit applies only during the normal phase. Once bracket mode starts, there is no round limit — matches play until a winner is determined.

---

## Open Decisions

- Exact auto-transition delays (currently 5 seconds assumed for bracket/match result screens)
- Whether to show total delta scores on the BracketScreen
