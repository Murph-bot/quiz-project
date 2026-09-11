---
name: static-html-site
description: >-
  Static HTML/CSS/JS websites without frameworks. Use for club_website layout,
  responsive design, vanilla JS, and Node page generators.
---
# Static HTML / CSS / JS

## When to use

- `club_website` and similar sites
- No React, no build framework
- Node scripts that generate HTML from templates/data

## Principles

1. **Semantic HTML** — `header`, `nav`, `main`, `footer`
2. **Mobile-first CSS** — base styles for small screens, `min-width` media queries up
3. **Vanilla JS only** — no bundler unless user requests
4. **Generators over copy-paste** — repeated pages → `scripts/build-pages.js`

## Responsive checklist

- [ ] `viewport` meta tag
- [ ] Touch targets ≥ 44px
- [ ] No horizontal scroll at 390px width
- [ ] Images: `max-width: 100%`, explicit dimensions where possible

## Node generator pattern

```javascript
const fs = require('fs')
const template = fs.readFileSync('templates/page.html', 'utf8')
const pages = [{ slug: 'about', title: 'About' }]
for (const p of pages) {
  fs.writeFileSync(`${p.slug}.html`, template.replace('{{title}}', p.title))
}
```

## Accessibility

- Alt text on images
- Sufficient color contrast
- Focus styles on interactive elements
- `lang` attribute on `<html>` (e.g. `el` for Greek content)

## Do not

- Add Next.js/Vite "for convenience" without user approval
- Inline large blocks of duplicated HTML across files
- Break Netlify redirects or security headers
