import { spawn } from 'node:child_process'
import { CronJob } from 'cron'
import { db } from '@/lib/db'
import { isDemoMode } from '@/lib/demo'

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
const LOG_PREFIX = '[demo-reset]'

let seedInFlight = false

function runSeed(): Promise<void> {
  return new Promise((resolve) => {
    if (seedInFlight) {
      console.warn(`${LOG_PREFIX} seed already running, skipping this tick`)
      resolve()
      return
    }
    seedInFlight = true
    const startedAt = Date.now()
    console.warn(`${LOG_PREFIX} starting seed: npx tsx ${SEED_SCRIPT}`)

    const child = spawn('npx', ['tsx', SEED_SCRIPT], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout?.on('data', (buf: Buffer) => {
      const line = buf.toString().trimEnd()
      if (line) console.warn(`${LOG_PREFIX} ${line}`)
    })
    child.stderr?.on('data', (buf: Buffer) => {
      const line = buf.toString().trimEnd()
      if (line) console.error(`${LOG_PREFIX} ${line}`)
    })

    child.on('close', (code) => {
      seedInFlight = false
      const ms = Date.now() - startedAt
      if (code === 0) {
        console.warn(`${LOG_PREFIX} seed completed in ${ms}ms`)
      } else {
        console.error(`${LOG_PREFIX} seed exited with code ${code} after ${ms}ms`)
      }
      resolve()
    })
    child.on('error', (err) => {
      seedInFlight = false
      console.error(`${LOG_PREFIX} failed to spawn seed process:`, err)
      resolve()
    })
  })
}

async function seedIfEmpty() {
  try {
    const count = await db.customer.count({ where: { organizationId: DEMO_ORG_ID } })
    if (count === 0) {
      console.warn(`${LOG_PREFIX} demo org empty on boot — seeding now`)
      await runSeed()
    } else {
      console.warn(`${LOG_PREFIX} demo org has ${count} customers — skipping boot seed`)
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} boot-seed check failed:`, err)
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
      console.error(`${LOG_PREFIX} scheduled reset failed:`, err)
    }
  })
  job.start()
  console.warn(`${LOG_PREFIX} scheduled: every 3 hours (cron: 0 */3 * * *)`)
}
