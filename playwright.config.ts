import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests: the app in a real browser, against a real Postgres.
 *
 * The 190-odd vitest files mock Prisma, so they prove the actions think
 * correctly and nothing else. These prove the parts that only break when the
 * pieces are assembled: migrations, the session cookie, server actions wired to
 * forms, and the invoice numbering that customers actually see.
 *
 * Deliberately serial against one seeded database. Parallel workers sharing a
 * quote counter would fail on each other's numbers rather than on real bugs.
 */

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'
const port = new URL(baseURL).port || '3100'

/** The database the harness is allowed to destroy. Never the dev one. */
const databaseUrl = process.env.E2E_DATABASE_URL ?? ''

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL,
    // Pinned, because selectors read visible text and the app speaks twelve
    // languages. The locale cookie is set alongside this in auth.setup.ts.
    locale: 'en-US',
    extraHTTPHeaders: { 'accept-language': 'en' },
    // Pinned for the same reason invoice dates are: a floating timezone turns
    // a date assertion into a coin toss either side of midnight.
    timezoneId: process.env.E2E_TZ ?? 'Europe/Oslo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/owner.json' },
      dependencies: ['setup'],
    },
  ],

  /**
   * Started only when E2E_BASE_URL is unset, so pointing the suite at a running
   * container (or a staging host) is a matter of setting one variable.
   *
   * `next start` and not `next dev`: the dev server compiles routes on first
   * visit, which turns the first assertion in every spec into a timeout race,
   * and it is not the artifact that ships anyway.
   */
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run start -- --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          DATABASE_URL: databaseUrl,
          NEXT_PUBLIC_APP_URL: baseURL,
          BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'e2e-secret-not-for-production',
          // Demo mode blocks invites, billing and outbound messages. Tests want
          // the real behaviour, so it stays off.
          DEMO_MODE: 'false',
          TZ: process.env.E2E_TZ ?? 'Europe/Oslo',
        },
      },
})
