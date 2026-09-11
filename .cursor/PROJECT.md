---
description: >-
  QuizKnight real-time multiplayer trivia game. Read when working in quizknight/
  or on session/round/realtime game logic.
---
# QuizKnight

**Path:** `~/Documents/Claude_Project_quizknight/quizknight`  
**Live:** https://quizknight-433.netlify.app  
**Brain:** parent `CLAUDE.md` (game rules — authoritative)

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind v4
- Supabase Postgres + Realtime (WebSocket channels)
- Vercel deploy (`vercel.json` crons: ping, cleanup)
- Jest + Testing Library (`npm test` — 111 tests)

## Architecture

```
src/app/api/sessions/     → create, join, start, rounds, close, next
src/components/GameScreen.tsx → realtime game loop, timer, reveal
src/lib/supabase*.ts        → client + server Supabase
supabase/migrations/        → schema (run in order)
supabase/seed.sql           → ~300 questions
```

## Game loop (critical)

1. Host creates session → lobby (min 3 players)
2. Host starts → round 1 with timer
3. Players answer → **any player** can close round when timer expires
4. Reveal → auto-advance ~12s → next round
5. Farthest from correct is out (no-answer is worst); ties among farthest get a tiebreak; everyone equally wrong → replay; resurrection on host interval; at 4 alive → bracket semis then final

## Env vars (never commit)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CLEANUP_SECRET
```

## Skills to use

- `supabase-realtime` — channels, session state
- `vercel-nextjs` — deploy, crons, env
- `tdd-workflow` — all game-logic changes need tests
- `postgres-patterns` — migrations, queries
- `security-review` — session secrets, API routes

## Test before ship

```bash
cd quizknight && npm test && npm run build
```

## Common pitfalls

- Round stuck on "Waiting for round to close" → close route + host presence
- `Failed to create session` → Supabase DNS/env; run migrations + seed
- Only host can call `/rounds/next` (advance); any player can `/close`
