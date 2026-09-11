import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Puts a known database in front of the suite: every migration applied to an
 * empty schema, then the demo seed.
 *
 * The seed is the reason this is cheap. It pins its user and organisation ids
 * and writes a password hash better-auth can verify, so the tests get a
 * populated workshop and a working login without a mail server in the loop.
 *
 * Run from the web server's own command line, ahead of `next start`, because
 * Playwright brings the server up before global setup runs and a server on an
 * empty schema answers every page with an error. When the suite is pointed at
 * a server somebody else started, global setup calls this instead.
 */

const TEST_DB_MARKERS = ['e2e', 'test']

function devDatabaseUrl(): string | null {
  const envFile = resolve(process.cwd(), '.env')
  if (!existsSync(envFile)) return null
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/)
    if (match) return match[1].trim()
  }
  return null
}

/**
 * Refuses to point the reset at anything that looks like real data. Resetting
 * drops every table, so a copy-pasted connection string is the one mistake
 * worth being rude about.
 */
function assertSafeToDestroy(url: string): void {
  if (process.env.E2E_ALLOW_ANY_DB === '1') return

  const dev = devDatabaseUrl()
  if (dev && dev === url) {
    throw new Error(
      'E2E_DATABASE_URL is the same database as .env DATABASE_URL. ' +
        'The suite resets the database it is given; point it at a throwaway one.'
    )
  }

  const database = url.split('/').pop()?.split('?')[0]?.toLowerCase() ?? ''
  if (!TEST_DB_MARKERS.some((marker) => database.includes(marker))) {
    throw new Error(
      `Refusing to reset database "${database}": the name contains neither "e2e" nor "test". ` +
        'Rename it, or set E2E_ALLOW_ANY_DB=1 if you are certain.'
    )
  }
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  execFileSync(command, args, { stdio: 'inherit', env })
}

export function prepareDatabase(): void {
  const url = process.env.E2E_DATABASE_URL
  if (!url) {
    throw new Error('E2E_DATABASE_URL is not set. See e2e/README.md.')
  }
  if (process.env.E2E_SKIP_SEED === '1') {
    console.log('[e2e] E2E_SKIP_SEED=1, leaving the database alone.')
    return
  }

  assertSafeToDestroy(url)

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: url,
    // The seed writes vehicle photos next to the app's uploads. Kept out of the
    // real data directory so a test run cannot disturb a running instance.
    DATA_ROOT: process.env.E2E_DATA_ROOT ?? resolve(process.cwd(), 'e2e/.data'),
    // The seed's own default is four characters, which the reset-password
    // page refuses; the suite seeds the owner with the password it signs in
    // with, long enough to be set back after the reset flow has changed it.
    DEMO_USER_EMAIL: process.env.E2E_USER_EMAIL ?? 'demo@torqvoice.com',
    DEMO_USER_PASSWORD: process.env.E2E_USER_PASSWORD ?? 'demo-e2e-pass',
  }

  console.log('[e2e] resetting the test database')
  // Prisma 7 has no seed hook in this config and no skip flags: reset applies
  // every migration and nothing else, and the seed is the step after.
  run('npx', ['prisma', 'migrate', 'reset', '--force'], env)

  console.log('[e2e] seeding')
  run('npx', ['tsx', 'prisma/seed_dummy_data.ts'], env)
}

// `tsx e2e/prepare-db.ts` from the web server command.
if (process.argv[1]?.endsWith('prepare-db.ts')) prepareDatabase()
