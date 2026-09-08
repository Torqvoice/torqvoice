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
 * Skipped entirely with E2E_SKIP_SEED=1, for the case where the suite runs
 * against a container someone else has already prepared.
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

export default async function globalSetup(): Promise<void> {
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
  }

  console.log('[e2e] resetting the test database')
  run('npx', ['prisma', 'migrate', 'reset', '--force', '--skip-seed', '--skip-generate'], env)

  console.log('[e2e] seeding')
  run('npx', ['tsx', 'prisma/seed_dummy_data.ts'], env)
}
