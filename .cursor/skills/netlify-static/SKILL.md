---
name: netlify-static
description: >-
  Netlify static site deploy for club_website. Use for netlify.toml, redirects,
  headers, zero-build publish, and gallery build scripts.
---
# Netlify Static Sites (Club Website)

## When to use

- `club_website` deploy or config
- `netlify.toml` headers / redirects
- `_redirects` file
- No framework build step (`publish = "."`)

## Typical `netlify.toml`

```toml
[build]
  publish = "."

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
```

## Build scripts (pre-deploy)

```bash
node scripts/build-pages.js
node scripts/build-gallery.js
```

Commit generated HTML if that's the project convention, or run in CI before publish.

## Deploy

```bash
npx netlify deploy --prod    # from club_website root
```

Or Git-connected auto-deploy on push.

## Skills

- `static-html-site` — HTML/CSS/JS patterns
- Netlify skills in Cursor plugins (`netlify-config`, `netlify-deploy`) for deep reference

## Pitfalls

- Do not add `npm run build` to netlify.toml unless a build step exists
- Test mobile layout — primary audience on phones
- Security headers should not break gallery images or fonts
