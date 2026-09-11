# ⚔️ QuizKnight

Last-one-standing trivia for friends. Players join a room with a 4-letter code,
answer numeric-estimation questions under time pressure, and get eliminated each
round until a champion remains — with semifinal/final bracket rounds at 4 and 2
players, tiebreaks, and optional resurrections.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** — design tokens live in `src/app/globals.css` (`--color-qk-*`)
- **Supabase** — Postgres (sessions/players/questions/rounds/answers) + Realtime
  (broadcast + presence) for room sync
- **Jest** + React Testing Library for tests

## Setup

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Realtime subscribe/presence only (RLS blocks table access) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | DB access in API routes, server-side broadcast |
| `ADMIN_SECRET` | server | Admin panel login (`/admin`) |
| `CLEANUP_SECRET` | server | Netlify scheduled-cleanup + manual `/api/cleanup` calls |
| `CRON_SECRET` | server | Vercel cron calls to `/api/cleanup` (only if Vercel crons are enabled) |
| `NEXT_PUBLIC_SENTRY_DSN` | client + server | Optional — Sentry error monitoring; leave unset to keep the SDK inert |

### Database

Migrations live in `supabase/migrations/` (`001`–`013`). There is no local
Supabase CLI setup — apply them in order in the Supabase **SQL editor**.
`011_normalize_categories.sql` includes apply notes in its header. Seed data is
in `supabase/seed.sql`. `src/lib/database.types.ts` is hand-maintained to match
the migrations — regenerate it with `supabase gen types typescript --linked`
once the CLI is available.

## Commands

```bash
npm run dev     # dev server (127.0.0.1:3000)
npm test        # jest — use `npx jest --runInBand` if a worker crashes
npm run lint    # eslint
npm run build   # production build
```

## Architecture notes

- **Server-authoritative realtime.** Clients *never* broadcast game state.
  API routes mutate the DB, then publish authoritative events
  (`round:closed`, `round:started`, `all:answered`, `host:changed`,
  `game:exhausted`, `game:started`) via `src/lib/realtime.ts`
  (Supabase HTTP broadcast, service-role key). Clients listen and reconcile;
  missed events are recovered by API polls (e.g. `GET /rounds/[roundId]`).
- **Player auth** is a per-player `session_secret` (uuid) issued at join and
  required by every mutating endpoint. `session_secret` is never returned by
  the session GET endpoint.
- **Round lifecycle** (close → reveal → next/tiebreak/bracket/final/winner) is
  in `src/lib/game/roundLifecycle.ts`; shared transition helpers in
  `src/lib/game/gameRoundTransitions.ts`.
- **Rate limiting** (`src/lib/rateLimit.ts`) is an in-memory fixed window on
  session create/join — a soft cap only; it does not span serverless instances.

## Hosting

Production runs on **Netlify** (`quizknight-433.netlify.app`); a Vercel
deployment (`quiz-project-phi-sooty.vercel.app`) exists as fallback.

- Netlify: `netlify/functions/scheduled-ping.ts` + `scheduled-cleanup.ts`
  (inline `config.schedule`) hit `/api/ping` and `/api/cleanup` daily.
- Vercel: `vercel.json` crons hit the same endpoints on the Vercel deployment.

**Both are currently configured** — cleanup runs are duplicated across
providers (harmless but wasteful; they share the same Supabase project).
Eventually pick one provider for scheduled jobs and remove the other side.

## Known follow-ups

- Realtime channels are public topics (`room:{code}`) — anyone with a room
  code can still *send* broadcasts. Clients therefore treat broadcasts as
  hints and re-confirm against the API before applying (`round:closed`,
  `round:started`, `host:changed` are all verified server-side). Residual
  risk: `all:answered` / `game:exhausted` can still be forged to trigger an
  early close attempt or a premature exhaustion screen, and the close
  endpoint does not itself enforce the round deadline. For full enforcement,
  move to **private channels + Realtime authorization** (Supabase dashboard).
- Session create/start are multi-step writes; consider atomic RPC functions
  (`rpc()`) if partial-failure orphans become a problem (cleanup sweeps them).
- Replace the in-memory rate limiter with a distributed store if the app ever
  runs more than one server instance.
- Reconsider the default `system-ui` font stack if a display font is desired —
  no `next/font` is currently wired.
