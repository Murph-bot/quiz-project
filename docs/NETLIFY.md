# QuizKnight on Netlify

**Production URL:** https://quizknight-433.netlify.app

> `quizknight.netlify.app` was already taken globally. This site uses `quizknight-433`.

**Vercel fallback (retained):** https://quiz-project-phi-sooty.vercel.app

## One-time: enable Git auto-deploy

The repo is configured (`Murph-bot/quiz-project`, branch `main`) but Netlify needs GitHub App access:

1. Open https://app.netlify.com/projects/quizknight-433/settings/deploys
2. Under **Continuous deployment**, click **Link repository** (or **Configure**)
3. Choose **GitHub** → authorize Netlify → select `Murph-bot/quiz-project`
4. Build settings (should match `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `.next`
   - Branch: `main`
5. Save — push to `main` should trigger deploys automatically

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
