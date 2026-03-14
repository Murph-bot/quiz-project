# QuizKnight Foundation + Lobby Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the project foundation (Tailwind, Supabase, schema, testing) and session/lobby layer (create game, join game, live waiting room with Supabase Realtime Presence).

**Architecture:** Next.js 15 App Router with Tailwind CSS. Supabase Postgres stores sessions and players. API routes handle all write operations server-side. Supabase Realtime Presence tracks live players in the lobby client-side. Player identity is a UUID stored in `sessionStorage`.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS v4, Supabase JS v2, Jest, @testing-library/react

---

## File Structure

### New Files
```
src/
  types/index.ts                                  - Shared TypeScript interfaces (Session, Player, PresencePlayer)
  lib/supabase.ts                                 - Browser Supabase client singleton (Realtime, used in components)
  lib/supabase-server.ts                          - Server Supabase client factory (used in API routes)
  lib/roomCode.ts                                 - Room code generation + validation (pure functions)
  app/api/sessions/route.ts                       - POST: create session + host player
  app/api/sessions/[roomCode]/route.ts            - GET: fetch session + players
  app/api/sessions/[roomCode]/join/route.ts       - POST: join session as new player
  app/api/sessions/[roomCode]/category/route.ts   - PATCH: update session category (host only)
  app/lobby/[roomCode]/page.tsx                   - Lobby page (server component shell)
  components/HomeScreen.tsx                       - Home UI: nickname input + create/join form
  components/LobbyScreen.tsx                      - Lobby UI: room code display + player list + host controls
  components/PlayerList.tsx                       - Presence-driven live player list
  __tests__/lib/roomCode.test.ts                  - Unit tests for roomCode utility
  __tests__/api/sessions-create.test.ts           - Tests for POST /api/sessions
  __tests__/api/sessions-get.test.ts              - Tests for GET /api/sessions/[roomCode]
  __tests__/api/sessions-join.test.ts             - Tests for POST /api/sessions/[roomCode]/join
  __tests__/api/sessions-category.test.ts         - Tests for PATCH /api/sessions/[roomCode]/category
  __tests__/components/HomeScreen.test.tsx        - Component tests for HomeScreen
  supabase/migrations/001_initial_schema.sql      - Database schema (run manually in Supabase SQL editor)
  jest.config.ts                                  - Jest configuration
  jest.setup.ts                                   - Jest setup (testing-library matchers)
  .env.local                                      - Supabase keys (not committed)
```

### Modified Files
```
package.json          - Add Supabase, Jest, testing-library dependencies
tailwind.config.ts    - Add Party Game Energy theme colours
src/app/globals.css   - Base styles: gradient background, resets
src/app/layout.tsx    - Metadata, font, html wrapper
src/app/page.tsx      - Render HomeScreen
.gitignore            - Add .env.local, .superpowers/
```

---

## Chunk 1: Foundation

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Supabase and testing dependencies**

```bash
cd /Users/sotirios/Documents/Claude_Project_quizknight/quizknight
npm install @supabase/supabase-js
npm install --save-dev jest @types/jest jest-environment-node ts-jest @testing-library/react @testing-library/jest-dom @testing-library/user-event jest-environment-jsdom
```

- [ ] **Step 2: Verify installs succeeded**

```bash
npm list @supabase/supabase-js jest @testing-library/react
```
Expected: versions printed with no errors

---

### Task 2: Configure Jest

**Files:**
- Create: `jest.config.ts`
- Create: `jest.setup.ts`

- [ ] **Step 1: Create jest.config.ts**

```ts
// jest.config.ts
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
}

export default createJestConfig(config)
```

- [ ] **Step 2: Create jest.setup.ts**

```ts
// jest.setup.ts
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Add test script to package.json**

Add to the `scripts` section:
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 4: Verify Jest runs**

```bash
npx jest --passWithNoTests
```
Expected: `Test Suites: 0 skipped` or similar — no errors

---

### Task 3: Configure Tailwind CSS

**Files:**
- Modify: `tailwind.config.ts` (create if missing)
- Modify: `src/app/globals.css`

- [ ] **Step 1: Check if Tailwind is installed**

```bash
npm list tailwindcss
```
If not installed:
```bash
npm install tailwindcss @tailwindcss/postcss postcss
```

- [ ] **Step 2: Update globals.css with base styles**

```css
/* src/app/globals.css */
@import "tailwindcss";

*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100dvh;
  font-family: system-ui, -apple-system, sans-serif;
  background: linear-gradient(135deg, #6c2eb9 0%, #e91e8c 100%);
  background-attachment: fixed;
}
```

- [ ] **Step 3: Verify the dev server starts**

```bash
npm run dev &
sleep 3
curl -s http://localhost:3000 | head -20
kill %1
```
Expected: HTML response (the default Next.js page)

---

### Task 4: Supabase project setup (manual steps)

**No code changes — documentation only.**

- [ ] **Step 1: Create Supabase project**

  1. Go to https://supabase.com and sign in
  2. Click "New Project"
  3. Name: `quizknight`, choose a region close to your users
  4. Wait for the project to provision (~1 minute)

- [ ] **Step 2: Create .env.local**

Create `quizknight/.env.local` (never commit this file):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Find these values in: Supabase Dashboard → Project Settings → API

- [ ] **Step 3: Verify .gitignore covers secrets**

Open `.gitignore` and confirm these lines exist (add if missing):
```
.env.local
.superpowers/
```

---

### Task 5: Database schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/001_initial_schema.sql

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code    text UNIQUE NOT NULL,
  host_id      uuid NOT NULL,
  status       text DEFAULT 'lobby' CHECK (status IN ('lobby', 'active', 'finished')),
  category     text DEFAULT 'all',
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE players (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid REFERENCES sessions(id) ON DELETE CASCADE,
  nickname     text NOT NULL,
  is_host      boolean DEFAULT false,
  is_alive     boolean DEFAULT true,
  joined_at    timestamptz DEFAULT now(),
  UNIQUE (session_id, nickname)
);

CREATE TABLE questions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text         text NOT NULL,
  answer       integer NOT NULL,
  category     text NOT NULL,
  time_limit   integer NOT NULL
);

CREATE INDEX idx_sessions_room_code ON sessions(room_code);
CREATE INDEX idx_players_session_id ON players(session_id);
```

- [ ] **Step 2: Run the migration in Supabase**

  1. Open Supabase Dashboard → SQL Editor
  2. Paste the contents of `001_initial_schema.sql`
  3. Click "Run"
  4. Expected: "Success. No rows returned."

- [ ] **Step 3: Enable Realtime on the project**

  Supabase Dashboard → Realtime → confirm it is enabled (it is by default on new projects — no table-level configuration needed for Presence channels)

---

### Task 6: Shared TypeScript types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Write the types file**

```ts
// src/types/index.ts

export interface Session {
  id: string
  room_code: string
  host_id: string
  status: 'lobby' | 'active' | 'finished'
  category: string
  created_at: string
}

export interface Player {
  id: string
  session_id: string
  nickname: string
  is_host: boolean
  is_alive: boolean
  joined_at: string
}

// Shape of each entry tracked via Supabase Presence
export interface PresencePlayer {
  playerId: string
  nickname: string
  isHost: boolean
}
```

---

### Task 7: Supabase client libraries

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/lib/supabase-server.ts`

- [ ] **Step 1: Create browser client**

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 2: Create server client factory**

```ts
// src/lib/supabase-server.ts
import { createClient } from '@supabase/supabase-js'

export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

---

### Task 8: roomCode utility + tests (TDD)

**Files:**
- Create: `src/lib/roomCode.ts`
- Create: `__tests__/lib/roomCode.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/lib/roomCode.test.ts
import { generateRoomCode, isValidRoomCode } from '@/lib/roomCode'

describe('generateRoomCode', () => {
  it('returns a 4-character string', () => {
    expect(generateRoomCode()).toHaveLength(4)
  })

  it('only contains uppercase letters and digits', () => {
    const code = generateRoomCode()
    expect(code).toMatch(/^[A-Z0-9]{4}$/)
  })

  it('generates different codes on repeated calls', () => {
    const codes = new Set(Array.from({ length: 20 }, generateRoomCode))
    expect(codes.size).toBeGreaterThan(1)
  })
})

describe('isValidRoomCode', () => {
  it('accepts a valid 4-char uppercase code', () => {
    expect(isValidRoomCode('AB12')).toBe(true)
  })

  it('rejects lowercase', () => {
    expect(isValidRoomCode('ab12')).toBe(false)
  })

  it('rejects codes shorter than 4 chars', () => {
    expect(isValidRoomCode('AB1')).toBe(false)
  })

  it('rejects codes longer than 4 chars', () => {
    expect(isValidRoomCode('AB123')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidRoomCode('')).toBe(false)
  })

  it('rejects special characters', () => {
    expect(isValidRoomCode('AB!@')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/lib/roomCode.test.ts
```
Expected: FAIL — "Cannot find module '@/lib/roomCode'"

- [ ] **Step 3: Implement roomCode.ts**

```ts
// src/lib/roomCode.ts
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function generateRoomCode(): string {
  return Array.from(
    { length: 4 },
    () => CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join('')
}

export function isValidRoomCode(code: string): boolean {
  return /^[A-Z0-9]{4}$/.test(code)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/lib/roomCode.test.ts
```
Expected: PASS — 9 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/lib/roomCode.ts __tests__/lib/roomCode.test.ts
git commit -m "feat: add roomCode utility with tests"
```

---

### Task 9: Update home page and layout

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update layout.tsx**

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'QuizKnight',
  description: 'Last one standing wins',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Update page.tsx to render HomeScreen (placeholder)**

```tsx
// src/app/page.tsx
export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <p className="text-white font-bold text-xl">QuizKnight — coming soon</p>
    </main>
  )
}
```

- [ ] **Step 3: Verify the page renders**

```bash
npm run dev &
sleep 3
curl -s http://localhost:3000 | grep -i "QuizKnight"
kill %1
```
Expected: line containing "QuizKnight" in the HTML

- [ ] **Step 4: Commit foundation**

```bash
git add src/app/layout.tsx src/app/page.tsx src/app/globals.css \
        src/types/index.ts src/lib/supabase.ts src/lib/supabase-server.ts \
        supabase/ jest.config.ts jest.setup.ts package.json .gitignore
git commit -m "feat: project foundation — Tailwind, Supabase clients, schema, types"
```

---

## Chunk 2: API Routes

### Task 10: POST /api/sessions — create session

**Files:**
- Create: `src/app/api/sessions/route.ts`
- Create: `__tests__/api/sessions-create.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/api/sessions-create.test.ts
import { POST } from '@/app/api/sessions/route'
import { NextRequest } from 'next/server'

// Mock Supabase server client
jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

import { createServerClient } from '@/lib/supabase-server'

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/sessions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/sessions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 if nickname is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 if nickname is empty', async () => {
    const res = await POST(makeRequest({ nickname: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if nickname exceeds 20 chars', async () => {
    const res = await POST(makeRequest({ nickname: 'a'.repeat(21) }))
    expect(res.status).toBe(400)
  })

  it('creates session and returns roomCode and playerId on success', async () => {
    const mockInsert = jest.fn().mockResolvedValue({ error: null })
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({ insert: mockInsert }),
    })

    const res = await POST(makeRequest({ nickname: 'SirAnswers' }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toHaveProperty('roomCode')
    expect(body).toHaveProperty('playerId')
    expect(body.roomCode).toMatch(/^[A-Z0-9]{4}$/)
  })

  it('returns 500 if Supabase insert fails', async () => {
    const mockInsert = jest.fn().mockResolvedValue({ error: { message: 'DB error' } })
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({ insert: mockInsert }),
    })

    const res = await POST(makeRequest({ nickname: 'SirAnswers' }))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/api/sessions-create.test.ts
```
Expected: FAIL — "Cannot find module '@/app/api/sessions/route'"

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/sessions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { generateRoomCode } from '@/lib/roomCode'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const nickname = (body.nickname ?? '').trim()

  if (!nickname || nickname.length > 20) {
    return NextResponse.json({ error: 'Invalid nickname' }, { status: 400 })
  }

  const supabase = createServerClient()
  const roomCode = generateRoomCode()
  const playerId = crypto.randomUUID()

  // Insert session first (host_id is the pre-generated player UUID)
  const { error: sessionError } = await supabase.from('sessions').insert({
    room_code: roomCode,
    host_id: playerId,
  })

  if (sessionError) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  // Fetch the created session to get its id
  const { data: session, error: fetchError } = await supabase
    .from('sessions')
    .select('id')
    .eq('room_code', roomCode)
    .single()

  if (fetchError || !session) {
    return NextResponse.json({ error: 'Failed to retrieve session' }, { status: 500 })
  }

  // Insert the host player with the pre-generated UUID
  const { error: playerError } = await supabase.from('players').insert({
    id: playerId,
    session_id: session.id,
    nickname,
    is_host: true,
  })

  if (playerError) {
    return NextResponse.json({ error: 'Failed to create player' }, { status: 500 })
  }

  return NextResponse.json({ roomCode, playerId }, { status: 201 })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/api/sessions-create.test.ts
```
Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sessions/route.ts __tests__/api/sessions-create.test.ts
git commit -m "feat: POST /api/sessions — create session and host player"
```

---

### Task 11: GET /api/sessions/[roomCode] — fetch session

**Files:**
- Create: `src/app/api/sessions/[roomCode]/route.ts`
- Create: `__tests__/api/sessions-get.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/api/sessions-get.test.ts
import { GET } from '@/app/api/sessions/[roomCode]/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: jest.fn(),
}))

import { createServerClient } from '@/lib/supabase-server'

function makeRequest(roomCode: string) {
  return new NextRequest(`http://localhost/api/sessions/${roomCode}`)
}

const mockSession = { id: 'sess-1', room_code: 'AB12', status: 'lobby', category: 'all' }
const mockPlayers = [{ id: 'p1', nickname: 'Alice', is_host: true }]

describe('GET /api/sessions/[roomCode]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 for invalid room code', async () => {
    const res = await GET(makeRequest('bad!'), { params: Promise.resolve({ roomCode: 'bad!' }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 if session not found', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      }),
    })

    const res = await GET(makeRequest('AB12'), { params: Promise.resolve({ roomCode: 'AB12' }) })
    expect(res.status).toBe(404)
  })

  it('returns session and players on success', async () => {
    const mockSupabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockSession, error: null }),
          }
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ data: mockPlayers, error: null }),
        }
      }),
    }
    ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)

    const res = await GET(makeRequest('AB12'), { params: Promise.resolve({ roomCode: 'AB12' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toHaveProperty('session')
    expect(body).toHaveProperty('players')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/api/sessions-get.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/sessions/[roomCode]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params

  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('room_code', roomCode)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('*')
    .eq('session_id', session.id)

  if (playersError) {
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 })
  }

  return NextResponse.json({ session, players })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/api/sessions-get.test.ts
```
Expected: PASS — 3 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sessions/[roomCode]/route.ts __tests__/api/sessions-get.test.ts
git commit -m "feat: GET /api/sessions/[roomCode] — fetch session and players"
```

---

### Task 12: POST /api/sessions/[roomCode]/join — join session

**Files:**
- Create: `src/app/api/sessions/[roomCode]/join/route.ts`
- Create: `__tests__/api/sessions-join.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/api/sessions-join.test.ts
import { POST } from '@/app/api/sessions/[roomCode]/join/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
import { createServerClient } from '@/lib/supabase-server'

function makeRequest(roomCode: string, body: object) {
  return new NextRequest(`http://localhost/api/sessions/${roomCode}/join`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const mockSession = { id: 'sess-1', status: 'lobby' }

describe('POST /api/sessions/[roomCode]/join', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 for invalid room code', async () => {
    const res = await POST(makeRequest('bad!', { nickname: 'Alice' }), {
      params: Promise.resolve({ roomCode: 'bad!' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 if nickname is missing', async () => {
    const res = await POST(makeRequest('AB12', {}), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 if session not found', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      }),
    })

    const res = await POST(makeRequest('AB12', { nickname: 'Alice' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 409 if session already started', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { ...mockSession, status: 'active' }, error: null }),
      }),
    })

    const res = await POST(makeRequest('AB12', { nickname: 'Alice' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(409)
  })

  it('returns 201 with playerId on success', async () => {
    const mockSupabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockSession, error: null }),
          }
        }
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
        }
      }),
    }
    ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)

    const res = await POST(makeRequest('AB12', { nickname: 'Alice' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toHaveProperty('playerId')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/api/sessions-join.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/sessions/[roomCode]/join/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params
  const body = await req.json()
  const nickname = (body.nickname ?? '').trim()

  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }

  if (!nickname || nickname.length > 20) {
    return NextResponse.json({ error: 'Invalid nickname' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, status')
    .eq('room_code', roomCode)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.status !== 'lobby') {
    return NextResponse.json({ error: 'Game already started' }, { status: 409 })
  }

  const playerId = crypto.randomUUID()

  const { error: playerError } = await supabase.from('players').insert({
    id: playerId,
    session_id: session.id,
    nickname,
    is_host: false,
  })

  if (playerError) {
    // Unique constraint violation = nickname taken
    if (playerError.code === '23505') {
      return NextResponse.json({ error: 'Nickname already taken' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to join session' }, { status: 500 })
  }

  return NextResponse.json({ playerId }, { status: 201 })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/api/sessions-join.test.ts
```
Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sessions/[roomCode]/join/route.ts __tests__/api/sessions-join.test.ts
git commit -m "feat: POST /api/sessions/[roomCode]/join — join session as player"
```

---

### Task 13: PATCH /api/sessions/[roomCode]/category — update category

**Files:**
- Create: `src/app/api/sessions/[roomCode]/category/route.ts`
- Create: `__tests__/api/sessions-category.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/api/sessions-category.test.ts
import { PATCH } from '@/app/api/sessions/[roomCode]/category/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
import { createServerClient } from '@/lib/supabase-server'

const VALID_CATEGORIES = ['all', 'history', 'science', 'money', 'geography', 'sports']

function makeRequest(roomCode: string, body: object) {
  return new NextRequest(`http://localhost/api/sessions/${roomCode}/category`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('PATCH /api/sessions/[roomCode]/category', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 for invalid category', async () => {
    const res = await PATCH(makeRequest('AB12', { category: 'invalid' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 if playerId is missing', async () => {
    const res = await PATCH(makeRequest('AB12', { category: 'all' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 403 if player is not the host', async () => {
    ;(createServerClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { is_host: false }, error: null }),
      }),
    })

    const res = await PATCH(makeRequest('AB12', { category: 'all', playerId: 'p1' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(403)
  })

  it('returns 200 on successful category update', async () => {
    const mockUpdate = jest.fn().mockReturnThis()
    const mockEq = jest.fn().mockResolvedValue({ error: null })
    const mockSupabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'players') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { is_host: true }, error: null }),
          }
        }
        return { update: mockUpdate, eq: mockEq }
      }),
    }
    ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)

    const res = await PATCH(makeRequest('AB12', { category: 'history', playerId: 'p1' }), {
      params: Promise.resolve({ roomCode: 'AB12' }),
    })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/api/sessions-category.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/sessions/[roomCode]/category/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isValidRoomCode } from '@/lib/roomCode'

const VALID_CATEGORIES = ['all', 'history', 'science', 'money', 'geography', 'sports']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params
  const body = await req.json()
  const { category, playerId } = body

  if (!isValidRoomCode(roomCode)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
  }

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  if (!playerId) {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Verify requester is the host
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('is_host')
    .eq('id', playerId)
    .single()

  if (playerError || !player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }

  if (!player.is_host) {
    return NextResponse.json({ error: 'Only the host can change category' }, { status: 403 })
  }

  const { error: updateError } = await supabase
    .from('sessions')
    .update({ category })
    .eq('room_code', roomCode)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }

  return NextResponse.json({ category })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/api/sessions-category.test.ts
```
Expected: PASS — 4 tests passing

- [ ] **Step 5: Run all API tests**

```bash
npx jest __tests__/api/
```
Expected: PASS — all API tests passing

- [ ] **Step 6: Commit**

```bash
git add src/app/api/sessions/[roomCode]/category/route.ts __tests__/api/sessions-category.test.ts
git commit -m "feat: PATCH /api/sessions/[roomCode]/category — host updates category"
```

---

## Chunk 3: UI Components + Pages

### Task 14: HomeScreen component + tests

**Files:**
- Create: `src/components/HomeScreen.tsx`
- Create: `__tests__/components/HomeScreen.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// __tests__/components/HomeScreen.test.tsx
/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HomeScreen from '@/components/HomeScreen'

// Mock Next.js router
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

// Mock fetch
global.fetch = jest.fn()

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Mock sessionStorage
    Object.defineProperty(window, 'sessionStorage', {
      value: { setItem: jest.fn(), getItem: jest.fn() },
      writable: true,
    })
  })

  it('renders the app title', () => {
    render(<HomeScreen />)
    expect(screen.getByText(/QuizKnight/i)).toBeInTheDocument()
  })

  it('renders nickname input, create button, and join fields', () => {
    render(<HomeScreen />)
    expect(screen.getByPlaceholderText(/nickname/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create game/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/room code/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /join/i })).toBeInTheDocument()
  })

  it('shows error if nickname is empty on create', async () => {
    render(<HomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /create game/i }))
    expect(await screen.findByText(/nickname/i)).toBeInTheDocument()
  })

  it('shows error if room code is empty on join', async () => {
    render(<HomeScreen />)
    fireEvent.change(screen.getByPlaceholderText(/nickname/i), { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: /join/i }))
    expect(await screen.findByText(/room code/i)).toBeInTheDocument()
  })

  it('calls create API and redirects on success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ roomCode: 'AB12', playerId: 'p-uuid' }),
    })

    render(<HomeScreen />)
    fireEvent.change(screen.getByPlaceholderText(/nickname/i), { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: /create game/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/lobby/AB12')
    })
  })

  it('calls join API and redirects on success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ playerId: 'p-uuid' }),
    })

    render(<HomeScreen />)
    fireEvent.change(screen.getByPlaceholderText(/nickname/i), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByPlaceholderText(/room code/i), { target: { value: 'AB12' } })
    fireEvent.click(screen.getByRole('button', { name: /join/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/lobby/AB12')
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/components/HomeScreen.test.tsx
```
Expected: FAIL — "Cannot find module '@/components/HomeScreen'"

- [ ] **Step 3: Implement HomeScreen.tsx**

```tsx
// src/components/HomeScreen.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomeScreen() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function validate(requireCode: boolean): boolean {
    if (!nickname.trim()) {
      setError('Please enter a nickname')
      return false
    }
    if (nickname.trim().length > 20) {
      setError('Nickname must be 20 characters or fewer')
      return false
    }
    if (requireCode && !roomCode.trim()) {
      setError('Please enter a room code')
      return false
    }
    return true
  }

  async function handleCreate() {
    if (!validate(false)) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create game'); return }
      sessionStorage.setItem('playerId', data.playerId)
      sessionStorage.setItem('nickname', nickname.trim())
      router.push(`/lobby/${data.roomCode}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!validate(true)) return
    setLoading(true)
    setError('')
    const code = roomCode.trim().toUpperCase()
    try {
      const res = await fetch(`/api/sessions/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to join game'); return }
      sessionStorage.setItem('playerId', data.playerId)
      sessionStorage.setItem('nickname', nickname.trim())
      router.push(`/lobby/${code}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-4">
      <div className="w-full max-w-sm flex flex-col gap-4">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-4xl font-black text-white tracking-tight">⚔️ QuizKnight</h1>
          <p className="text-white/70 text-sm mt-1">Last one standing wins</p>
        </div>

        {/* Form card */}
        <div className="bg-white/15 backdrop-blur border border-white/30 rounded-2xl p-5 flex flex-col gap-3">
          {/* Nickname */}
          <input
            type="text"
            placeholder="Your nickname"
            maxLength={20}
            value={nickname}
            onChange={e => { setNickname(e.target.value); setError('') }}
            className="w-full bg-white/20 border border-white/40 rounded-xl px-4 py-3 text-white placeholder-white/50 font-bold text-sm focus:outline-none focus:border-white"
          />

          {/* Create */}
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full bg-white text-purple-700 font-black text-sm rounded-full py-3 disabled:opacity-50 active:scale-95 transition-transform"
          >
            🎮 Create Game
          </button>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-white/20" />
            <span className="text-white/40 text-xs">or join</span>
            <div className="flex-1 h-px bg-white/20" />
          </div>

          {/* Join */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Room code"
              maxLength={4}
              value={roomCode}
              onChange={e => { setRoomCode(e.target.value.toUpperCase()); setError('') }}
              className="flex-1 bg-white/20 border border-white/40 rounded-xl px-4 py-3 text-white placeholder-white/50 font-bold text-sm uppercase tracking-widest focus:outline-none focus:border-white"
            />
            <button
              onClick={handleJoin}
              disabled={loading}
              className="bg-orange-500 text-white font-black text-sm rounded-full px-5 disabled:opacity-50 active:scale-95 transition-transform"
            >
              Join
            </button>
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-300 text-xs text-center font-semibold">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/components/HomeScreen.test.tsx
```
Expected: PASS — 6 tests passing

- [ ] **Step 5: Update app/page.tsx to render HomeScreen**

```tsx
// src/app/page.tsx
import HomeScreen from '@/components/HomeScreen'

export default function Home() {
  return <HomeScreen />
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/HomeScreen.tsx src/app/page.tsx __tests__/components/HomeScreen.test.tsx
git commit -m "feat: HomeScreen component — create/join game UI"
```

---

### Task 15: PlayerList component + tests

**Files:**
- Create: `src/components/PlayerList.tsx`
- Create: `__tests__/components/PlayerList.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// __tests__/components/PlayerList.test.tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import PlayerList from '@/components/PlayerList'
import type { PresencePlayer } from '@/types'

const mockPlayers: PresencePlayer[] = [
  { playerId: '1', nickname: 'Alice', isHost: true },
  { playerId: '2', nickname: 'Bob', isHost: false },
]

describe('PlayerList', () => {
  it('renders "Waiting for players..." when list is empty', () => {
    render(<PlayerList players={[]} />)
    expect(screen.getByText(/waiting for players/i)).toBeInTheDocument()
  })

  it('renders each player nickname', () => {
    render(<PlayerList players={mockPlayers} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows host label next to the host player', () => {
    render(<PlayerList players={mockPlayers} />)
    expect(screen.getByText('host')).toBeInTheDocument()
  })

  it('displays the correct player count', () => {
    render(<PlayerList players={mockPlayers} maxPlayers={50} />)
    expect(screen.getByText(/2 \/ 50/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/components/PlayerList.test.tsx
```
Expected: FAIL — "Cannot find module '@/components/PlayerList'"

- [ ] **Step 3: Implement PlayerList.tsx**

```tsx
// src/components/PlayerList.tsx
import type { PresencePlayer } from '@/types'

interface Props {
  players: PresencePlayer[]
  maxPlayers?: number
}

export default function PlayerList({ players, maxPlayers = 50 }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">
        {players.length} / {maxPlayers} players
      </p>
      <div className="bg-white/15 backdrop-blur border border-white/30 rounded-2xl overflow-hidden">
        {players.length === 0 && (
          <p className="text-white/40 text-sm text-center py-4">Waiting for players...</p>
        )}
        {players.map((player, index) => (
          <div
            key={player.playerId}
            className={`flex items-center gap-3 px-4 py-3 ${
              index < players.length - 1 ? 'border-b border-white/15' : ''
            }`}
          >
            <span className="text-lg">{player.isHost ? '👑' : '🧙'}</span>
            <span className="text-white font-bold text-sm flex-1">{player.nickname}</span>
            {player.isHost && (
              <span className="text-white/40 text-xs uppercase tracking-widest">host</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/components/PlayerList.test.tsx
```
Expected: PASS — 4 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/components/PlayerList.tsx __tests__/components/PlayerList.test.tsx
git commit -m "feat: PlayerList component — renders presence-driven player list"
```

---

### Task 16: LobbyScreen component

**Files:**
- Create: `src/components/LobbyScreen.tsx`

- [ ] **Step 1: Implement LobbyScreen.tsx**

This component owns the Supabase Realtime Presence channel for the lobby.

```tsx
// src/components/LobbyScreen.tsx
'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import PlayerList from '@/components/PlayerList'
import type { Session, PresencePlayer } from '@/types'

const VALID_CATEGORIES = ['all', 'history', 'science', 'money', 'geography', 'sports']
const MIN_PLAYERS = 3

interface Props {
  roomCode: string
  initialSession: Session
}

export default function LobbyScreen({ roomCode, initialSession }: Props) {
  const router = useRouter()
  const [players, setPlayers] = useState<PresencePlayer[]>([])
  const [category, setCategory] = useState(initialSession.category)
  const [starting, setStarting] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const playerId = typeof window !== 'undefined' ? sessionStorage.getItem('playerId') : null
  const nickname = typeof window !== 'undefined' ? sessionStorage.getItem('nickname') : null
  const isHost = players.find(p => p.playerId === playerId)?.isHost ?? false

  useEffect(() => {
    if (!playerId || !nickname) {
      router.push('/')
      return
    }

    const channel = supabase.channel(`room:${roomCode}`)
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresencePlayer>()
        const list = Object.values(state).flat()
        setPlayers(list)
      })
      .on('broadcast', { event: 'game:start' }, () => {
        // Layer 3: navigate to game screen (404 until Layer 3 is built)
        router.push(`/game/${roomCode}`)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            playerId,
            nickname,
            isHost: initialSession.host_id === playerId,
          })
        }
      })

    return () => {
      channel.unsubscribe()
    }
  }, [roomCode, playerId, nickname, initialSession.host_id, router])

  async function handleCategoryChange(newCategory: string) {
    const previousCategory = category
    setCategory(newCategory) // optimistic update
    const res = await fetch(`/api/sessions/${roomCode}/category`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: newCategory, playerId }),
    })
    if (!res.ok) {
      setCategory(previousCategory) // roll back on failure
    }
  }

  async function handleStart() {
    if (players.length < MIN_PLAYERS || !isHost) return
    setStarting(true)
    channelRef.current?.send({
      type: 'broadcast',
      event: 'game:start',
      payload: {},
    })
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-4">
      <div className="w-full max-w-sm flex flex-col gap-5">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl font-black text-white">⚔️ QuizKnight</h1>
        </div>

        {/* Room code (hero) */}
        <div className="text-center bg-white/15 backdrop-blur border border-white/30 rounded-2xl py-5">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">Room Code</p>
          <p className="text-white text-5xl font-black tracking-[0.3em]">{roomCode}</p>
          <p className="text-white/50 text-xs mt-2">Share this code with friends</p>
        </div>

        {/* Player list */}
        <PlayerList players={players} />

        {/* Category selector (host only) */}
        {isHost && (
          <div className="flex flex-col gap-2">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">Category</p>
            <select
              value={category}
              onChange={e => handleCategoryChange(e.target.value)}
              className="bg-white/20 border border-white/40 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none capitalize"
            >
              {VALID_CATEGORIES.map(c => (
                <option key={c} value={c} className="text-purple-900 capitalize">{c}</option>
              ))}
            </select>
          </div>
        )}

        {/* Start / waiting */}
        {isHost ? (
          <button
            onClick={handleStart}
            disabled={players.length < MIN_PLAYERS || starting}
            className="w-full bg-white text-purple-700 font-black text-sm rounded-full py-4 disabled:opacity-40 active:scale-95 transition-transform"
          >
            {players.length < MIN_PLAYERS
              ? `Need ${MIN_PLAYERS - players.length} more player${MIN_PLAYERS - players.length > 1 ? 's' : ''}`
              : starting ? 'Starting...' : '🚀 Start Game'}
          </button>
        ) : (
          <p className="text-center text-white/60 text-sm">Waiting for host to start...</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LobbyScreen.tsx
git commit -m "feat: LobbyScreen — real-time lobby with Supabase Presence"
```

---

### Task 17: Lobby page

**Files:**
- Create: `src/app/lobby/[roomCode]/page.tsx`

- [ ] **Step 1: Create the lobby page**

This is a server component that fetches initial session data then renders LobbyScreen.

```tsx
// src/app/lobby/[roomCode]/page.tsx
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import LobbyScreen from '@/components/LobbyScreen'

interface Props {
  params: Promise<{ roomCode: string }>
}

export default async function LobbyPage({ params }: Props) {
  const { roomCode } = await params

  const supabase = createServerClient()

  const { data: session, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('room_code', roomCode)
    .single()

  if (error || !session || session.status === 'finished') {
    notFound()
  }

  return <LobbyScreen roomCode={roomCode} initialSession={session} />
}
```

- [ ] **Step 2: Run all tests to confirm nothing is broken**

```bash
npx jest
```
Expected: PASS — all tests passing

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

  1. Open http://localhost:3000
  2. Enter a nickname and click "Create Game"
  3. Confirm redirect to `/lobby/[CODE]` with the room code displayed large
  4. Open a second browser tab, go to http://localhost:3000
  5. Enter a different nickname, enter the room code, click "Join"
  6. Confirm both tabs show both players in the player list (live, no refresh)
  7. Back in the first tab (host), confirm Start button is disabled until 3 players join

- [ ] **Step 4: Final commit**

```bash
git add src/app/lobby/
git commit -m "feat: lobby page — server-rendered shell with live Presence player list"
```

---

## Done

Layers 1–2 are complete:
- ✅ Project foundation: Tailwind, Supabase clients, schema, shared types
- ✅ Room code utility with full test coverage
- ✅ All 4 API routes tested and implemented
- ✅ HomeScreen: create/join game UI
- ✅ LobbyScreen: live player list via Supabase Realtime Presence
- ✅ Host controls: category selection + Start Game (wired for Layer 3)

**Next:** Layer 3 — Game loop (questions, timer, answer submission, real-time sync)
