# QuizKnight on Netlify

**Production URL:** https://quizknight-433.netlify.app

> `quizknight.netlify.app` was already taken globally. This site uses `quizknight-433`.

**Vercel fallback (retained):** https://quiz-project-phi-sooty.vercel.app

## Git auto-deploy

Repo: `Murph-bot/quiz-project`, branch `main`.

Build settings (in dashboard and `netlify.toml`):

- Build command: `npm run build`
- Publish directory: `.next`
- Functions directory: `netlify/functions`

Push to `main` triggers production deploys via **GitHub Actions** (`.github/workflows/netlify-deploy.yml`).

> Netlify's built-in Git deploy may fail on private repos until the [Netlify GitHub App](https://github.com/apps/netlify) is granted access to `Murph-bot/quiz-project`. GitHub Actions is the reliable path until then.

Required GitHub repository secrets: `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CLEANUP_SECRET`

## Environment variables

Set in Netlify dashboard or via CLI:

```bash
npm run netlify:login
npx netlify env:import .env.local -r
npx netlify deploy --prod
```

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CLEANUP_SECRET`

## Scheduled tasks

| Function | Schedule | Calls |
|----------|----------|-------|
| `scheduled-ping` | 09:00 UTC daily | `GET /api/ping` |
| `scheduled-cleanup` | 03:00 UTC daily | `GET /api/cleanup` (Bearer `CLEANUP_SECRET`) |

Vercel crons in `vercel.json` remain valid for the fallback deployment.

## Manual deploy

```bash
npx netlify deploy --prod
```
