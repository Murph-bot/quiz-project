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
npm run test:e2e # playwright golden path — env-gated, see below
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

## E2E testing

`e2e/golden-path.spec.ts` covers create → join → start → answer → reveal with
three real browser contexts. It is **env-gated**: without the vars below every
test skips, so `npm run test:e2e` is a no-op locally until configured.

```bash
export E2E_BASE_URL=http://localhost:3000            # app under test
export E2E_SUPABASE_URL=https://<test-project>.supabase.co
export E2E_SUPABASE_SERVICE_ROLE_KEY=<test-key>
npx playwright install chromium   # one-time browser install
npm run dev                       # app pointed at the TEST project
npm run test:e2e
```

Point these at a **dedicated test Supabase project**, never production — the
spec seeds and deletes real rows. The app under test must use the same test
project in its own env. CI can run it once those secrets exist.

## Hosting

Production runs on **Cloudflare Workers** (`quizknight.workers.dev`) via the
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) adapter — Next.js
SSR, API routes, and static assets all served from one Worker.

- **Config**: `wrangler.jsonc` (worker name, `nodejs_compat`, assets binding,
  `WORKER_SELF_REFERENCE` service binding, cron triggers). `worker.ts` is the
  custom entry — it re-exports the OpenNext fetch handler and adds a
  `scheduled()` handler that self-invokes `/api/cleanup` (03:00 UTC) and
  `/api/ping` (09:00 UTC), replacing the old Netlify functions + Vercel crons.
- **Build/preview/deploy**: `npm run preview` (local workers-runtime preview),
  `npm run deploy` (build + `wrangler deploy`).
- **Env vars**: `NEXT_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` are inlined at
  build time; runtime values (`SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET`,
  `CLEANUP_SECRET`, and the two public Supabase vars for server-side reads)
  are pushed with `wrangler secret bulk secrets.json` — the CI deploy does
  this automatically from repo secrets.
- **CI**: `.github/workflows/cloudflare-deploy.yml` gates on lint + typecheck +
  tests, then `opennextjs-cloudflare deploy` with `CLOUDFLARE_API_TOKEN` +
  `CLOUDFLARE_ACCOUNT_ID` repo secrets.
- Local wrangler dev needs the app's env in `.dev.vars` (gitignored) — copy
  `.env.local` into it.

Rollback: the previous Netlify/Vercel config lives in git history
(`git revert` the migration commit).

## Known follow-ups

- Realtime channels are public topics (`room:{code}`) — anyone with a room
  code can still *send* broadcasts. Clients therefore treat broadcasts as
  hints and re-confirm against the API before applying (`round:closed`,
  `round:started`, `host:changed` are all verified server-side). Residual
  risk: `all:answered` / `game:exhausted` can still be forged to trigger an
  early close attempt or a premature exhaustion screen (the close endpoint
  does enforce the round deadline, so at worst it wastes a request). For full
  enforcement, move to **private channels + Realtime authorization** (Supabase
  dashboard).
- Session create/start are multi-step writes; consider atomic RPC functions
  (`rpc()`) if partial-failure orphans become a problem (cleanup sweeps them).
- Replace the in-memory rate limiter with a distributed store if the app ever
  runs more than one server instance.
- Reconsider the default `system-ui` font stack if a display font is desired —
  no `next/font` is currently wired.
