import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { backgroundJobsState } from '@/lib/background-jobs'
import { db } from '@/lib/db'
import { uploadsRoot } from '@/lib/upload-root'

/**
 * What the container's health check asks (HEALTHCHECK in the Dockerfile):
 * can this server do its job, not only answer. Each check names what failed,
 * so `docker logs` and an uptime monitor say why, not just that.
 */

/** Under Docker's own 5 s timeout, so a slow database is reported as such. */
export const DATABASE_TIMEOUT_MS = 3000
/** Three missed beats of the every-minute heartbeat. */
export const JOBS_STALE_MS = 3 * 60 * 1000

export type HealthChecks = {
  database: 'ok' | 'timeout' | 'unreachable'
  storage: 'ok' | 'not_writable'
  jobs: 'ok' | 'disabled' | 'not_started' | 'stalled'
}

export type HealthReport = { healthy: boolean; checks: HealthChecks }

async function checkDatabase(): Promise<HealthChecks['database']> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), DATABASE_TIMEOUT_MS)
  })
  try {
    return await Promise.race([db.$queryRaw`SELECT 1`.then(() => 'ok' as const), timeout])
  } catch {
    return 'unreachable'
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The uploads folder is made on the first upload, so until it exists the
 * nearest folder above it has to take it. A volume owned by the wrong user is
 * the usual reason this fails: the app starts and every photo is refused.
 */
async function checkStorage(): Promise<HealthChecks['storage']> {
  let dir = uploadsRoot()
  for (;;) {
    try {
      await access(dir, constants.W_OK)
      return 'ok'
    } catch (error) {
      const parent = path.dirname(dir)
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || parent === dir) {
        return 'not_writable'
      }
      dir = parent
    }
  }
}

/** Reminders, scheduled messages and backups all run on these timers. */
function checkJobs(now: number): HealthChecks['jobs'] {
  const state = backgroundJobsState()
  if (!state) return 'not_started'
  if (state.disabled) return 'disabled'
  return now - state.lastBeatAt <= JOBS_STALE_MS ? 'ok' : 'stalled'
}

let lastHealthy: boolean | undefined

export async function checkHealth(now = Date.now()): Promise<HealthReport> {
  const [database, storage] = await Promise.all([checkDatabase(), checkStorage()])
  const jobs = checkJobs(now)
  const checks: HealthChecks = { database, storage, jobs }
  const healthy = database === 'ok' && storage === 'ok' && (jobs === 'ok' || jobs === 'disabled')

  // One line when the answer changes, not one per probe, so an outage leaves
  // its start and end in the log without filling it.
  if (healthy !== lastHealthy) {
    const failing = Object.entries(checks)
      .filter(([, value]) => value !== 'ok' && value !== 'disabled')
      .map(([name, value]) => `${name}=${value}`)
      .join(' ')
    if (!healthy) console.error(`[health] failing: ${failing}`)
    else if (lastHealthy === false) console.warn('[health] passing again')
    lastHealthy = healthy
  }

  return { healthy, checks }
}
