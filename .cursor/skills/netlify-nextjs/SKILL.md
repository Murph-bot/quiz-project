---
name: netlify-nextjs
description: >-
  Deploy Next.js on Netlify for portfolio_website. Use for netlify.toml build
  settings, Node version, Netlify Forms, and adapter configuration.
---
# Netlify + Next.js (Portfolio)

## When to use

- `portfolio_website` build or deploy failures
- `netlify.toml` configuration
- Netlify Forms contact flow
- Node version mismatches

## Typical config

```toml
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "20"
```

Use `@netlify/plugin-nextjs` if documented in project — check existing `netlify.toml`.

## Netlify Forms

- Skeleton form in `public/__forms.html` for build-time detection
- `data-netlify="true"` on visible form
- Honeypot / spam filtering via Netlify dashboard

## Local verify

```bash
cd portfolio_website && npm run build
```

## Deploy

```bash
npx netlify deploy --build --prod
```

## Env

Portfolio is mostly static — few secrets. Any API keys go in Netlify env UI, not committed.

## Related

- `nextjs-app-router` — app structure
- `frontend-patterns` — Framer Motion, Tailwind
- Cursor Netlify plugin skills for forms and frameworks reference
