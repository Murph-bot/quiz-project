import { test, expect, type Browser, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Golden-path E2E: create → join → start → answer → reveal.
 *
 * Requires (all three, pointing at a DEDICATED TEST Supabase project —
 * this spec writes and deletes real rows; never run it against prod):
 *   E2E_BASE_URL                     app under test, e.g. http://localhost:3000
 *   E2E_SUPABASE_URL                 test project URL
 *   E2E_SUPABASE_SERVICE_ROLE_KEY    test project service-role key
 *
 * The app at E2E_BASE_URL must itself be configured with the same test
 * project (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY), and the
 * test project's questions table is expected to contain only test rows —
 * the spec seeds one question, the game picks it, and afterAll removes it.
 */

const E2E_BASE_URL = process.env.E2E_BASE_URL
const E2E_SUPABASE_URL = process.env.E2E_SUPABASE_URL
const E2E_SUPABASE_SERVICE_ROLE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY
const E2E_READY = Boolean(E2E_BASE_URL && E2E_SUPABASE_URL && E2E_SUPABASE_SERVICE_ROLE_KEY)

const QUESTION = {
  text: 'E2E: what is the answer to everything?',
  answer: 42,
  category: 'History',
  time_limit: 30,
}

async function newPlayerPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}

test.describe('golden path', () => {
  test.skip(!E2E_READY, 'Set E2E_BASE_URL, E2E_SUPABASE_URL and E2E_SUPABASE_SERVICE_ROLE_KEY to run')

  let db: SupabaseClient
  let questionId: string | null = null
  let roomCode: string | null = null

  test.beforeAll(async () => {
    db = createClient(E2E_SUPABASE_URL!, E2E_SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })
    const { data, error } = await db.from('questions').insert(QUESTION).select('id').single()
    if (error || !data) throw new Error(`Failed to seed question: ${error?.message}`)
    questionId = data.id
  })

  test.afterAll(async () => {
    if (roomCode) {
      // players/rounds/answers cascade from the session row.
      await db.from('sessions').delete().eq('room_code', roomCode)
    }
    if (questionId) {
      await db.from('questions').delete().eq('id', questionId)
    }
  })

  test('three players can play a full round', async ({ browser }) => {
    const host = await newPlayerPage(browser)
    const guest2 = await newPlayerPage(browser)
    const guest3 = await newPlayerPage(browser)

    try {
      // --- Host creates the session ---
      await host.goto('/')
      await host.getByPlaceholder('Enter your name').fill('Hosty')
      await host.getByRole('button', { name: /create game/i }).click()
      await host.waitForURL(/\/lobby\//)
      roomCode = (await host.locator('p.text-5xl').first().innerText()).trim()
      expect(roomCode).toMatch(/^[A-Z0-9]{4}$/)

      // --- Guests join via the ?join= deep link (code prefilled) ---
      for (const [page, nick] of [
        [guest2, 'Deuce'],
        [guest3, 'Trey'],
      ] as const) {
        await page.goto(`/?join=${roomCode}`)
        await page.getByPlaceholder('Enter your name').fill(nick)
        await page.getByRole('button', { name: /^join$/i }).click()
        await page.waitForURL(/\/lobby\//)
      }

      // --- Host sees all three joined (lobby polls every ~5s) ---
      const startBtn = host.getByRole('button', { name: /start game/i })
      await expect(startBtn).toBeEnabled({ timeout: 15_000 })
      await startBtn.click()

      // --- Everyone lands on the question ---
      for (const page of [host, guest2, guest3]) {
        await page.waitForURL(/\/game\//)
        await expect(page.getByText(QUESTION.text)).toBeVisible({ timeout: 15_000 })
      }

      // --- All three answer; the last answer triggers all:answered → close ---
      const guesses: [Page, string][] = [
        [host, '41'],
        [guest2, '42'],
        [guest3, '100'],
      ]
      for (const [page, guess] of guesses) {
        await page.getByLabel('Your guess').fill(guess)
        await page.getByRole('button', { name: /lock it in/i }).click()
      }

      // --- Reveal: answer card + ranked guesses on every screen ---
      for (const page of [host, guest2, guest3]) {
        await expect(page.getByText('The answer is…')).toBeVisible({ timeout: 30_000 })
        await expect(page.getByText('42').first()).toBeVisible()
      }

      // Deuce guessed the exact answer → "exact!" on their row.
      const guest2Row = host.locator('div.rounded-xl', { hasText: 'Deuce' })
      await expect(guest2Row.getByText(/exact!/i)).toBeVisible()

      // Trey was farthest (|100−42|=58) → eliminated row.
      const guest3Row = host.locator('div.rounded-xl', { hasText: 'Trey' })
      await expect(guest3Row).toContainText('💀')
    } finally {
      await Promise.allSettled([host.close(), guest2.close(), guest3.close()])
    }
  })
})
