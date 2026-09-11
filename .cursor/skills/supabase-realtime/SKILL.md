---
name: supabase-realtime
description: >-
  Supabase Postgres and Realtime for quizknight. Use for sessions, players,
  rounds, channels, migrations, RLS, and service-role API routes.
---
# Supabase + Realtime (QuizKnight)

## When to use

- Session/player/round schema changes
- `supabase.channel()` broadcast in GameScreen
- Server-side writes via service role in API routes
- Migrations in `supabase/migrations/`
- Question bank / seed data

## Client vs server

| | Browser (`@/lib/supabase`) | API routes (`createServerClient`) |
|--|---------------------------|-----------------------------------|
| Key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `SUPABASE_SERVICE_ROLE_KEY` |
| Use | Realtime subscribe, presence | Inserts, updates, game logic |

Never expose service role key to the client.

## Realtime pattern (quizknight)

```typescript
const channel = supabase.channel(`room:${roomCode}`)
  .on('broadcast', { event: 'round:closed' }, ({ payload }) => { /* ... */ })
  .subscribe()
```

- Host broadcasts after server confirms close/next
- Sender does not receive own broadcast — update local state in fetch `.then()` too
- Use refs (`roundIdRef`) in listeners to avoid stale closures

## Migrations

Run in Supabase SQL editor in order: `001` → `010`, then `seed.sql`.

## Common errors

| Symptom | Fix |
|---------|-----|
| Failed to create session | Check env vars, DNS, migrations applied |
| No questions available | Run `seed.sql` |
| Round stuck | Close route + any-player close (see quizknight profile) |

## Skills

- `postgres-patterns` — SQL, indexes, query shape
- `database-migrations` — schema change workflow
- `security-review` — session_secret, auth on host-only routes
