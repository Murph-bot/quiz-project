import { defineConfig, devices } from '@playwright/test'

/**
 * Golden-path E2E — env-gated, runs only when configured.
 *
 * Required env vars (point at a dedicated TEST Supabase project, never prod):
 *   E2E_BASE_URL                     app under test, e.g. http://localhost:3000
 *   E2E_SUPABASE_URL                 test project URL
 *   E2E_SUPABASE_SERVICE_ROLE_KEY    test project service-role key (seed/cleanup)
 *
 * Run: npm run test:e2e
 * Local: start `npm run dev` with the TEST project's Supabase env vars.
 * CI: run the app against the test project, then invoke with the vars set.
 */
export default defineConfig({
  testDir: './e2e',
  // The spec orchestrates three players in one game — no parallelism.
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 90_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL,
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
