---
name: nextjs-app-router
description: >-
  Next.js App Router patterns for quizknight and portfolio_website. Use for
  layouts, server components, API routes, metadata, and Next 15/16 conventions.
---
# Next.js App Router (Cursor)

## When to use

- `src/app/` routes, layouts, loading/error boundaries
- Server vs client components (`'use client'`)
- API route handlers (`route.ts`)
- `generateMetadata`, `notFound()`, `redirect()`
- Next.js 15+ async `params` / `searchParams`

## Server vs client

| Server (default) | Client (`'use client'`) |
|------------------|-------------------------|
| Data fetch, DB, secrets | useState, useEffect, event handlers |
| `createServerClient()` | Browser Supabase client |
| No hooks | Realtime subscriptions |

## API routes

```typescript
// src/app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  return NextResponse.json({ ok: true }, { status: 201 })
}
```

- Validate input at boundary
- Return proper HTTP status codes (400, 403, 404, 409, 500)
- Use `createServerClient()` from `@/lib/supabase-server` in quizknight

## Async params (Next 15+)

```typescript
interface Props { params: Promise<{ id: string }> }

export default async function Page({ params }: Props) {
  const { id } = await params
}
```

## Checklist

- [ ] Secrets only in server code / env vars
- [ ] Client components minimal — push data fetching up
- [ ] `npm run build` passes before deploy
- [ ] Mobile viewport (`min-h-dvh`, safe areas) for user-facing pages

## Projects

- **quizknight** — Vercel, API-heavy, Supabase server client
- **portfolio_website** — Netlify, mostly static + Framer Motion client islands
