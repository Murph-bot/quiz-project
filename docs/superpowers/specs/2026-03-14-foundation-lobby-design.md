# QuizKnight — Foundation + Session/Lobby Design

**Date:** 2026-03-14
**Scope:** Layers 1–2 of 5 (Foundation + Session/Lobby)
**Status:** Approved

---

## Overview

QuizKnight is a real-time multiplayer trivia elimination web app. This spec covers the foundation (project scaffolding, Supabase setup, database schema) and the session/lobby layer (create game, join game, waiting room with live player list).

Players land on the home screen, enter a nickname and either create or join a game via room code. They are taken to the lobby where they wait for the host to start. The lobby shows a live player list powered by Supabase Realtime Presence.

---

## Visual Direction

**Party Game Energy** — vibrant purple-to-pink gradient backgrounds, white bold typography, pill-shaped buttons, frosted-glass panels.

- Background: `from-[#6c2eb9] to-[#e91e8c]` gradient
- Primary button: white pill, bold purple text
- Secondary button: orange pill, white text
- Panels: `bg-white/15 backdrop-blur border border-white/30 rounded-2xl`
- Font: system-ui, weights `font-bold` / `font-black`

---

## Architecture

**Stack:**
- Next.js 15 (App Router) — UI + API routes
- Tailwind CSS — styling
- Supabase JS client — database + realtime
- Supabase Realtime Presence — lobby player tracking
- Supabase Postgres — persistent state

**Pages:**
```
/                    → Home screen (create or join)
/lobby/[roomCode]    → Lobby (waiting room)
```

**Session identity:** No accounts. On join, a `playerId` (UUID) is stored in `sessionStorage`. Lost on tab close — reconnection is out of scope for this layer.

---

## Database Schema

### `sessions`
```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
room_code    text UNIQUE NOT NULL        -- e.g. "AB12", 4-char alphanumeric
host_id      uuid NOT NULL               -- references players.id
status       text DEFAULT 'lobby'        -- 'lobby' | 'active' | 'finished'
category     text DEFAULT 'all'
created_at   timestamptz DEFAULT now()
```

### `players`
```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
session_id   uuid REFERENCES sessions(id) ON DELETE CASCADE
nickname     text NOT NULL
is_host      boolean DEFAULT false
is_alive     boolean DEFAULT true
joined_at    timestamptz DEFAULT now()
UNIQUE (session_id, nickname)              -- enforced at DB level to prevent race conditions
```

### `questions`
```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
text         text NOT NULL
answer       integer NOT NULL
category     text NOT NULL
time_limit   integer NOT NULL            -- seconds (8–15)
```

Room codes are 4-character alphanumeric, generated server-side and checked for uniqueness before insert.

---

## Real-time Architecture

One Supabase Realtime channel per room: `room:{roomCode}`

### Presence (player list)
Each player tracks on join:
```js
channel.track({ playerId, nickname, isHost })
```
All clients subscribe to `presence` sync events and rebuild the player list from full presence state. Supabase auto-removes disconnected players (~10s timeout).

### Broadcast (wired for Layer 3)
The lobby wires a listener for `game:start` now so the game transition works when Layer 3 is built:
```js
channel.on('broadcast', { event: 'game:start' }, () => {
  router.push(`/game/${roomCode}`)
})
```
Note: `/game/[roomCode]` does not exist in this layer. The listener is wired now but will result in a 404 until Layer 3 is built — this is expected.

### Client lifecycle
```
/lobby/[roomCode] mounts
  → fetch session + players from Postgres (initial state)
  → join Presence channel on "room:{roomCode}"
  → subscribe to presence sync → rebuild player list
  → subscribe to broadcast "game:start" → navigate to /game

Component unmounts
  → untrack presence
  → unsubscribe channel
```

---

## App Structure

```
src/
  app/
    page.tsx                        → Home screen
    lobby/
      [roomCode]/
        page.tsx                    → Lobby
    api/
      sessions/
        route.ts                    → POST: create session
      sessions/[roomCode]/
        route.ts                    → GET: fetch session + players
      sessions/[roomCode]/join/
        route.ts                    → POST: add player to session
      sessions/[roomCode]/category/
        route.ts                    → PATCH: update session category (host only)
  components/
    HomeScreen.tsx                  → nickname input + create/join form
    LobbyScreen.tsx                 → big room code + player list + start button
    PlayerList.tsx                  → real-time player list (presence-driven)
  lib/
    supabase.ts                     → Supabase client singleton
    roomCode.ts                     → room code generation utility
```

---

## Home Screen UX

**All-in-one layout:**
- App name + tagline centered on gradient background
- Nickname input field
- "Create Game" primary button
- Room code input + "Join" secondary button inline

**Create flow:**
1. Validate nickname (non-empty, max 20 chars)
2. POST `/api/sessions` → generates room code, creates session + host player in Postgres
3. Store `playerId` in `sessionStorage`
4. Redirect to `/lobby/[roomCode]`

**Join flow:**
1. Validate nickname + room code
2. POST `/api/sessions/[roomCode]/join` → adds player to session, returns `playerId`
3. Store `playerId` in `sessionStorage`
4. Redirect to `/lobby/[roomCode]`

**Errors shown inline:**
- Room code not found
- Room already started
- Nickname taken in this session

---

## Lobby Screen UX

**Layout (Big code + list):**
- Room code displayed large and prominent at the top (easy to share verbally)
- Live scrollable player list below (nickname + crown for host)
- Player count (e.g. "4 / 50 players")
- Host sees "Start Game" button — disabled until 3+ players have joined
- Non-host players see "Waiting for host to start..."

**Category selection (host only):**
A simple dropdown/segmented control above the Start button. Options: All, History, Science, Money, Geography, Sports. Selection updates the `sessions.category` column.

---

## Supabase Setup Steps (from scratch)

1. Create a new Supabase project at supabase.com
2. Run schema migrations (sessions, players, questions tables)
3. Enable Realtime on the Supabase project (required for Presence channels — no table-level replication needed for this layer)
4. Add environment variables to `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
5. Add `.env.local` to `.gitignore`

---

## Out of Scope (this layer)

- Reconnection grace period
- Resurrection mechanic
- Game loop (questions, timer, answers, reveal)
- Elimination logic
- Spectator mode
- Admin/question bank management UI
