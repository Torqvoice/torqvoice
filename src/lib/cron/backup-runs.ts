import { CronJob } from 'cron'
import {
  BACKUP_CAPABILITY,
  BACKUP_STATE,
  backupOffsetMinutes,
} from '@/features/integrations/Lib/backup'
import { connectorAllowed } from '@/features/integrations/Lib/plan'
import { getManifest } from '@/integrations/registry'
import { backupLockHolder, queueBackupRun, reportOverdue, runBackup } from '@/lib/backup/engine'
import { intervalMs, isDue, readBackupSettings } from '@/lib/backup/schedule'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { workshopTimeZone } from '@/lib/workshop-timezone'

/**
 * Scheduled backups, every five minutes: start the runs that are due, one
 * after the other, and say so when a destination has had no good backup for
 * too long.
 *
 * Not the integration job runner: that one works through jobs one a minute
 * and puts back anything running longer than ten minutes, and a first backup
 * of a workshop with years of photos takes longer than that.
 */

const STALE_RUN_MS = 8 * 60 * 60 * 1000
const RETRY_AFTER_MS = 30 * 60 * 1000
const OVERDUE_ALERT_EVERY_MS = 24 * 60 * 60 * 1000
/** Hourly backups are not overdue after a single missed slot. */
const OVERDUE_MIN_MS = 3 * 60 * 60 * 1000

function stateDate(state: Record<string, unknown>, key: string): Date | null {
  const v = state[key]
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Runs this process is not working on, yet marked running for hours: a crash. */
export async function failStaleRuns(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_RUN_MS)
  const holder = backupLockHolder()
  const stale = await db.backupRun.findMany({
    where: { status: 'running', startedAt: { lt: cutoff } },
    select: { id: true },
  })
  let count = 0
  for (const run of stale) {
    if (holder?.runId === run.id) continue
    await db.backupRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        finishedAt: now,
        error: 'The run did not finish; the server was probably restarted',
      },
    })
    count++
  }
  return count
}

async function patchState(connectionId: string, patch: Record<string, unknown>) {
  const row = await db.integrationConnection.findUnique({
    where: { id: connectionId },
    select: { state: true },
  })
  await db.integrationConnection.update({
    where: { id: connectionId },
    data: { state: { ...((row?.state as Record<string, unknown>) ?? {}), ...patch } as object },
  })
}

/** One tick: queue and run every due backup. Returns how many ran. */
export async function processDueBackups(now = new Date()): Promise<number> {
  const connections = await db.integrationConnection.findMany({
    where: { status: { in: ['active', 'error'] } },
    select: { id: true, organizationId: true, connectorId: true, settings: true, state: true },
  })
  let ran = 0
  for (const c of connections) {
    const manifest = getManifest(c.connectorId)
    if (!manifest?.capabilities.includes(BACKUP_CAPABILITY)) continue
    try {
      // A destination connected on Pro stops when the plan no longer
      // includes it; nothing in the workshop's bucket is touched.
      if (!connectorAllowed(manifest, await getFeatures(c.organizationId))) continue
      const settings = readBackupSettings((c.settings as Record<string, unknown>) ?? {})
      const state = (c.state as Record<string, unknown>) ?? {}
      const timeZone = await workshopTimeZone(c.organizationId)
      const lastScheduled = stateDate(state, BACKUP_STATE.lastScheduledAt)
      const retryAt = stateDate(state, BACKUP_STATE.retryAt)
      const slotDue = isDue(
        settings,
        lastScheduled,
        now,
        timeZone,
        backupOffsetMinutes(c.organizationId)
      )
      const retryDue = retryAt !== null && retryAt <= now
      let outcome: string | null = null
      if (slotDue || retryDue) {
        // Stamped before the run, so a failure waits for the next slot (or
        // the one retry below) instead of running again on every tick. A
        // retry does not move the slot, so the regular rhythm holds.
        const patch: Record<string, unknown> = { [BACKUP_STATE.retryAt]: null }
        if (slotDue) patch[BACKUP_STATE.lastScheduledAt] = now.toISOString()
        if (!stateDate(state, BACKUP_STATE.firstScheduledAt)) {
          patch[BACKUP_STATE.firstScheduledAt] = now.toISOString()
        }
        await patchState(c.id, patch)
        let runId: string
        try {
          runId = (await queueBackupRun(c.id, 'scheduled')).runId
        } catch {
          continue // one is already queued or running
        }
        const result = await runBackup(runId)
        ran++
        outcome = result.status
        // One retry half an hour on, whether the run failed or was skipped
        // because another workshop's backup held the lock.
        if ((result.status === 'failed' || result.status === 'skipped') && !retryDue) {
          await patchState(c.id, {
            [BACKUP_STATE.retryAt]: new Date(now.getTime() + RETRY_AFTER_MS).toISOString(),
          })
        }
      }
      // The engine has written to the state by now; read it again rather
      // than judging the destination on what it looked like before the run.
      if (outcome !== 'done') {
        const fresh = await db.integrationConnection.findUnique({
          where: { id: c.id },
          select: { state: true },
        })
        await alertIfOverdue(
          c.id,
          c.organizationId,
          settings,
          (fresh?.state as Record<string, unknown>) ?? state,
          now
        )
      }
    } catch (err) {
      console.error(`[cron] backup for connection ${c.id} failed:`, err)
    }
  }
  return ran
}

async function alertIfOverdue(
  connectionId: string,
  organizationId: string,
  settings: ReturnType<typeof readBackupSettings>,
  state: Record<string, unknown>,
  now: Date
) {
  const lastGood = stateDate(state, BACKUP_STATE.lastGoodAt)
  const firstScheduled = stateDate(state, BACKUP_STATE.firstScheduledAt)
  // Nothing to miss until the first scheduled run has had its chance.
  if (!firstScheduled) return
  const limit = Math.max(2 * intervalMs(settings), OVERDUE_MIN_MS)
  const reference = lastGood ?? firstScheduled
  if (now.getTime() - reference.getTime() < limit) return
  const lastAlert = stateDate(state, BACKUP_STATE.lastOverdueAlertAt)
  if (lastAlert && now.getTime() - lastAlert.getTime() < OVERDUE_ALERT_EVERY_MS) return
  await patchState(connectionId, { [BACKUP_STATE.lastOverdueAlertAt]: now.toISOString() })
  await reportOverdue(connectionId, organizationId, lastGood)
}

export function processBackupRuns() {
  let ticking = false
  const job = new CronJob('*/5 * * * *', async () => {
    // A backup can outlast the five minutes; the next tick waits its turn.
    if (ticking) return
    ticking = true
    try {
      const stale = await failStaleRuns()
      if (stale > 0) console.warn(`[cron] Marked ${stale} stale backup run(s) as failed`)
      const ran = await processDueBackups()
      if (ran > 0) console.warn(`[cron] Scheduled backups run: ${ran}`)
    } catch (err) {
      console.error('[cron] Backup scheduler failed:', err)
    } finally {
      ticking = false
    }
  })
  job.start()
  console.warn('[cron] Backup scheduler started (every 5 minutes)')
}
