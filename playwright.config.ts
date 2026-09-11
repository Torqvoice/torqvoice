import { resolve } from 'node:path'
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

/** Where the mail sink listens: SMTP for the app, HTTP for the specs. */
const smtpPort = process.env.E2E_SMTP_PORT ?? '1025'
const mailApiPort = process.env.E2E_MAIL_API_PORT ?? '8025'

/**
 * A mail server that delivers nothing, so the specs can read what the app
 * posted. Started whether or not the suite starts the app: pointed at a
 * server somebody else launched, that server is told to send here too.
 */
/** Where the stand-in payment vendor listens, for the app and for the specs. */
const paymentPort = process.env.E2E_PAYMENT_PORT ?? '8026'
const paymentSinkUrl = `http://127.0.0.1:${paymentPort}`

/**
 * Stripe and PayPal as far as the app can tell, with a checkout page a spec
 * can pay on. Started in every mode, like the mail sink: a server somebody
 * else launched is told to use it through the two base URLs below.
 */
const paymentSink = {
  command: 'npx tsx e2e/payment-sink.ts',
  url: `${paymentSinkUrl}/health`,
  reuseExistingServer: !process.env.CI,
  timeout: 60_000,
  stdout: 'pipe' as const,
  stderr: 'pipe' as const,
  env: { E2E_PAYMENT_PORT: paymentPort },
}

/**
 * Which app the run is against. The suite's specs expect a self-hosted
 * install, where every feature is unlocked. `E2E_MODE=cloud` runs only
 * `specs/cloud`, against the same build started in cloud mode: plan limits,
 * the sign-up pitch and Google sign-in exist only there. One build serves
 * both, because the app URL baked into it is the same.
 */
const cloud = process.env.E2E_MODE === 'cloud'

/** Where the Google stand-in listens, for the app's server and for the specs. */
const googlePort = process.env.E2E_GOOGLE_PORT ?? '8027'
const googleStandinUrl = `http://127.0.0.1:${googlePort}`

/**
 * Google's account chooser and token endpoint, for the cloud run. The browser
 * is routed to it by the specs; the app's server is pointed at it by a
 * preload, because better-auth has Google's endpoints written into it.
 */
const googleStandin = {
  command: 'npx tsx e2e/google-standin.ts',
  url: `${googleStandinUrl}/health`,
  reuseExistingServer: !process.env.CI,
  timeout: 60_000,
  stdout: 'pipe' as const,
  stderr: 'pipe' as const,
  env: { E2E_GOOGLE_PORT: googlePort },
}

const mailSink = {
  command: 'npx tsx e2e/mail-sink.ts',
  url: `http://127.0.0.1:${mailApiPort}/health`,
  reuseExistingServer: !process.env.CI,
  timeout: 60_000,
  stdout: 'pipe' as const,
  stderr: 'pipe' as const,
  env: { E2E_SMTP_PORT: smtpPort, E2E_MAIL_API_PORT: mailApiPort },
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // On CI the suite runs in shards, one job each, and every shard writes a
  // blob; the workflow's last job merges them into a single HTML report.
  reporter: process.env.CI ? [['github'], ['blob']] : [['list'], ['html', { open: 'never' }]],

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
      // The cloud specs need the app in cloud mode, and the rest need it
      // self-hosted, so each run takes only its own.
      ...(cloud ? { testMatch: /specs\/cloud\/.*\.spec\.ts$/ } : { testIgnore: /specs\/cloud\// }),
    },
  ],

  /**
   * The mail sink always; the app only when E2E_BASE_URL is unset, so pointing
   * the suite at a running container (or a staging host) is a matter of
   * setting one variable.
   *
   * `next start` and not `next dev`: the dev server compiles routes on first
   * visit, which turns the first assertion in every spec into a timeout race,
   * and it is not the artifact that ships anyway.
   */
  webServer: process.env.E2E_BASE_URL
    ? [mailSink, paymentSink, ...(cloud ? [googleStandin] : [])]
    : [
        mailSink,
        paymentSink,
        ...(cloud ? [googleStandin] : []),
        {
          // The database first, then the server, in one command: Playwright
          // starts this before global setup, and a server on an empty schema
          // fails the readiness check on every page.
          command: `npx tsx e2e/prepare-db.ts && npm run start -- --port ${port}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          // Sixty-odd migrations, the seed and its vehicle photos, then the
          // server: a cold CI runner needs longer than a warm laptop.
          timeout: process.env.CI ? 420_000 : 180_000,
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            E2E_DATABASE_URL: databaseUrl,
            DATABASE_URL: databaseUrl,
            NEXT_PUBLIC_APP_URL: baseURL,
            // Long and random enough that better-auth does not spend the run
            // warning about it. Throwaway: it signs sessions for a database
            // the harness resets, and CI generates its own per run.
            BETTER_AUTH_SECRET:
              process.env.BETTER_AUTH_SECRET ?? 'k3Qb8vZ1hN7pXtR2yJm5Ls9CwD4gFa6UeH0iOoT+PbY=',
            // The schedulers would otherwise tick through the run, writing to
            // the rows the specs are asserting on.
            DISABLE_BACKGROUND_JOBS: '1',
            // Demo mode blocks invites, billing and outbound messages. Tests want
            // the real behaviour, so it stays off.
            DEMO_MODE: 'false',
            // Three sign-ins per ten seconds is right for a workshop and wrong
            // for a suite that signs in on every test.
            AUTH_RATE_LIMIT: 'off',
            // `next start` also reads the developer's .env, which may say cloud.
            // Self-hosted unlocks every feature, which is what a suite that
            // exercises them needs; plan gates are a subject of their own.
            TORQVOICE_MODE: cloud ? 'cloud' : 'self-hosted',
            // Google sign-in exists only in cloud mode, and only with a client
            // configured. The preload sends the server's token exchange to the
            // stand-in; outside the cloud run none of this is set.
            ...(cloud
              ? {
                  GOOGLE_AUTH_CLIENT_ID: 'e2e-google-client',
                  GOOGLE_AUTH_CLIENT_SECRET: 'e2e-google-secret',
                  E2E_GOOGLE_STANDIN_URL: googleStandinUrl,
                  NODE_OPTIONS: `--import=${resolve('e2e/google-standin-preload.mjs')}`,
                }
              : {}),
            TZ: process.env.E2E_TZ ?? 'Europe/Oslo',
            // Mail goes to the sink instead of a provider. The app's SMTP
            // settings fall back to these when nothing is configured in the
            // database, which is how the seeded workshop is left.
            SMTP_HOST: '127.0.0.1',
            SMTP_PORT: smtpPort,
            SMTP_FROM_EMAIL: 'workshop@e2e.test',
            SMTP_SECURE: 'false',
            // Payments go to the stand-in vendor. Read only from the
            // environment, so nothing a workshop stores can redirect a key.
            STRIPE_API_BASE_URL: paymentSinkUrl,
            PAYPAL_API_BASE_URL: paymentSinkUrl,
          },
        },
      ],
})
