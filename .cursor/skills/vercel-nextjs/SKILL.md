---
name: vercel-nextjs
description: >-
  Deploy and operate Next.js on Vercel for quizknight. Use for env vars, crons,
  production API checks, and redeploy after schema changes.
---
# Vercel + Next.js (QuizKnight)

## When to use

- Production deploy issues
- Environment variables for Supabase
- Cron jobs in `vercel.json`
- Verifying `/api/ping` and session creation

## Env vars (Vercel dashboard)

Set for **Production** and **Preview**:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CLEANUP_SECRET
```

Redeploy after changing env vars.

## Crons (`vercel.json`)

```json
{ "path": "/api/ping", "schedule": "0 9 * * *" }
```

Keeps serverless warm / health check — requires `CRON_SECRET` or route auth if secured.

## Verify production

```bash
curl https://quiz-project-phi-sooty.vercel.app/api/ping
curl -X POST .../api/sessions -H "Content-Type: application/json" -d '{"nickname":"test"}'
```

## Local dev

```bash
cd quizknight && npm run dev   # http://127.0.0.1:3000
```

## Checklist

- [ ] `npm run build` clean locally
- [ ] Env vars match `.env.local` names
- [ ] Supabase migrations + seed on production DB
- [ ] Git push to `main` triggers deploy

## Note

Portfolio and club site use **Netlify**, not Vercel — do not mix deploy docs.
