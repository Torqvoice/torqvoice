import { spawn } from 'node:child_process'
import { CronJob } from 'cron'
import { db } from '@/lib/db'
import { isDemoMode } from '@/lib/demo'
import { createLogger } from '@/lib/logger'

/**
 * Auto-reset the demo org's data every 3 hours so visitors get a clean slate.
 * The seed script at prisma/seed_dummy_data.ts is idempotent and performs its
 * own cleanup + provisioning, so we just invoke it via tsx.
 *
 * Also: if the demo org is empty on boot (fresh container), seed immediately
 * so the demo is usable on first request.
 */

const DEMO_ORG_ID = 'cmmh0vczm0000oiyan37vuyqf'
const SEED_SCRIPT = 'prisma/seed_dummy_data.ts'
const log = createLogger('demo-reset')

let seedInFlight = false

function runSeed(): Promise<void> {
  return new Promise((resolve) => {
    if (seedInFlight) {
      log.warn('Seed already running, skipping this tick')
      resolve()
      return
    }
    seedInFlight = true
    const startedAt = Date.now()
    log.info('Starting seed', { script: SEED_SCRIPT })

    const child = spawn('npx', ['tsx', SEED_SCRIPT], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout?.on('data', (buf: Buffer) => {
      const line = buf.toString().trimEnd()
      if (line) log.debug(line)
    })
    child.stderr?.on('data', (buf: Buffer) => {
      const line = buf.toString().trimEnd()
      if (line) log.warn(line)
    })

    child.on('close', (code) => {
      seedInFlight = false
      const ms = Date.now() - startedAt
      if (code === 0) {
        log.info('Seed completed', { ms })
      } else {
        log.error('Seed failed', { exitCode: code, ms })
      }
      resolve()
    })
    child.on('error', (err) => {
      seedInFlight = false
      log.error('Could not spawn the seed process', { err })
      resolve()
    })
  })
}

async function seedIfEmpty() {
  try {
    const count = await db.customer.count({ where: { organizationId: DEMO_ORG_ID } })
    if (count === 0) {
      log.info('Demo org empty on boot, seeding now')
      await runSeed()
    } else {
      log.info('Demo org already has data, skipping the boot seed', { customers: count })
    }
  } catch (err) {
    log.error('Boot-seed check failed', { err })
  }
}

/**
 * Schedules the 3-hourly demo reset. No-ops unless DEMO_MODE=true.
 * Call once from instrumentation.ts at server startup.
 */
export function startDemoResetCron() {
  if (!isDemoMode) return

  // Fire-and-forget boot seed — don't block instrumentation.register().
  void seedIfEmpty()

  const job = new CronJob('0 */3 * * *', async () => {
    try {
      await runSeed()
    } catch (err) {
      log.error('Scheduled reset failed', { err })
    }
  })
  job.start()
  log.info('Scheduled every 3 hours', { cron: '0 */3 * * *' })
}
