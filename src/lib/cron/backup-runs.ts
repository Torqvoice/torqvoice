import { CronJob } from 'cron'
import {
  BACKUP_CAPABILITY,
  BACKUP_STATE,
  backupOffsetMinutes,
} from '@/features/integrations/Lib/backup'
import type { BackupFrequency } from '@/features/integrations/Lib/backup-types'
import { connectorAllowed } from '@/features/integrations/Lib/plan'
import { SYSTEM_SETTING_KEYS } from '@/features/admin/Schema/systemSettingsSchema'
import { getManifest } from '@/integrations/registry'
import {
  BackupBusyError,
  backupLockHolder,
  drainBackupQueue,
  openPlatform,
  queueBackupRun,
  reportOverdue,
} from '@/lib/backup/engine'
import {
  PAUSED_GRACE_MS,
  platformBackupAllowed,
  platformBackupConfig,
  platformHost,
} from '@/lib/backup/platform'
import { resticForgetSnapshots, resticSnapshots } from '@/lib/backup/restic'
import {
  BACKUP_SETTING_DEFAULTS,
  intervalMs,
  isDue,
  readBackupSettings,
} from '@/lib/backup/schedule'
import { db } from '@/lib/db'
import { sendMail } from '@/lib/email'
import { getFeatures } from '@/lib/features'
import { workshopTimeZone } from '@/lib/workshop-timezone'

/**
 * Scheduled backups, every five minutes: queue the runs that are due, for
 * the destinations workshops connected and for the platform repositories
 * Torqvoice keeps on the cloud instance, then work through the queue one
 * run at a time. Also says so when a repository has had no good backup for
 * too long.
 *
 * Not the integration job runner: that one works through jobs one a minute
 * and puts back anything running longer than ten minutes, and a first backup
 * of a workshop with years of photos takes longer than that.
 */

const STALE_RUN_MS = 8 * 60 * 60 * 1000
/** A queued run nothing started in a day was queued by a process that is gone. */
const STALE_QUEUE_MS = 24 * 60 * 60 * 1000
const OVERDUE_ALERT_EVERY_MS = 24 * 60 * 60 * 1000
/** Hourly backups are not overdue after a single missed slot. */
const OVERDUE_MIN_MS = 3 * 60 * 60 * 1000
/** When the platform cycle has not completed for a workshop, we hear about it. */
const PLATFORM_OVERDUE_MS = 36 * 60 * 60 * 1000
/** Run rows older than this go, except the newest KEEP_RUNS of a repository. */
const RUN_HISTORY_MS = 90 * 24 * 60 * 60 * 1000
const KEEP_RUNS = 100
const PRUNE_EVERY_MS = 24 * 60 * 60 * 1000

const PLATFORM_FREQUENCIES: BackupFrequency[] = ['hourly', 'every4h', 'daily']

function stateDate(state: Record<string, unknown>, key: string): Date | null {
  const v = state[key]
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Runs this process is not working on, yet marked running for hours: a
 * crash. And runs queued a day ago that nothing ever started.
 */
export async function failStaleRuns(now = new Date()): Promise<number> {
  const holder = backupLockHolder()
  const stale = await db.backupRun.findMany({
    where: {
      OR: [
        { status: 'running', startedAt: { lt: new Date(now.getTime() - STALE_RUN_MS) } },
        { status: 'queued', createdAt: { lt: new Date(now.getTime() - STALE_QUEUE_MS) } },
      ],
    },
    select: { id: true, status: true },
  })
  let count = 0
  for (const run of stale) {
    if (holder?.runId === run.id) continue
    await db.backupRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        finishedAt: now,
        error:
          run.status === 'queued'
            ? 'The run was never started; the server was probably restarted'
            : 'The run did not finish; the server was probably restarted',
      },
    })
    count++
  }
  return count
}

/**
 * Every run leaves a row, and an hourly schedule leaves thousands a year.
 * The card reads the last ten; the rest is history nobody opens. Rows older
 * than ninety days go, except that a repository always keeps its newest
 * hundred, so one that fell quiet still shows what happened. A run still
 * queued or running is never touched. Returns how many went.
 */
export async function pruneOldRuns(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RUN_HISTORY_MS)
  const aged = await db.backupRun.findMany({
    where: { createdAt: { lt: cutoff } },
    distinct: ['organizationId', 'kind', 'connectionId'],
    select: { organizationId: true, kind: true, connectionId: true },
  })
  let count = 0
  for (const group of aged) {
    // The row just past the newest hundred: nothing newer than it goes.
    const [edge] = await db.backupRun.findMany({
      where: group,
      orderBy: { createdAt: 'desc' },
      skip: KEEP_RUNS,
      take: 1,
      select: { createdAt: true },
    })
    if (!edge) continue
    const { count: gone } = await db.backupRun.deleteMany({
      where: {
        ...group,
        createdAt: { lt: cutoff, lte: edge.createdAt },
        status: { in: ['done', 'failed', 'skipped'] },
      },
    })
    count += gone
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

/**
 * One tick for the destinations: queue every due backup. Returns how many
 * were queued; `drainBackupQueue` runs them.
 */
export async function processDueBackups(now = new Date()): Promise<number> {
  const connections = await db.integrationConnection.findMany({
    where: { status: { in: ['active', 'error'] } },
    select: { id: true, organizationId: true, connectorId: true, settings: true, state: true },
  })
  let queued = 0
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
      if (slotDue || retryDue) {
        // Stamped before the run, so a failure waits for the next slot (or
        // the one retry the engine books) instead of queueing again on every
        // tick. A retry does not move the slot, so the regular rhythm holds.
        const patch: Record<string, unknown> = { [BACKUP_STATE.retryAt]: null }
        if (slotDue) patch[BACKUP_STATE.lastScheduledAt] = now.toISOString()
        if (!stateDate(state, BACKUP_STATE.firstScheduledAt)) {
          patch[BACKUP_STATE.firstScheduledAt] = now.toISOString()
        }
        await patchState(c.id, patch)
        try {
          await queueBackupRun({ kind: 'destination', connectionId: c.id }, 'scheduled')
          queued++
        } catch (err) {
          if (!(err instanceof BackupBusyError)) throw err
          // One is queued or running already; it counts for this slot.
        }
      }
      await alertIfOverdue(c.id, c.organizationId, settings, state, now)
    } catch (err) {
      console.error(`[cron] backup for connection ${c.id} failed:`, err)
    }
  }
  return queued
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

/** How often the platform cycle runs: a system setting, hourly unless changed. */
export async function platformBackupFrequency(): Promise<BackupFrequency> {
  const row = await db.systemSetting.findUnique({
    where: { key: SYSTEM_SETTING_KEYS.PLATFORM_BACKUP_FREQUENCY },
    select: { value: true },
  })
  const value = row?.value as BackupFrequency | undefined
  return value && PLATFORM_FREQUENCIES.includes(value) ? value : 'hourly'
}

/**
 * One tick for the platform repositories, on the cloud instance only. Every
 * workshop whose plan includes them is queued when its slot is due; one
 * whose plan stopped including them is paused, and after the grace period
 * its repository's snapshots are forgotten. Returns how many were queued.
 */
export async function processDuePlatformBackups(now = new Date()): Promise<number> {
  if (!platformBackupConfig()) return 0
  const frequency = await platformBackupFrequency()
  const settings = { ...BACKUP_SETTING_DEFAULTS, frequency, time: '02:00' }
  const organizations = await db.organization.findMany({
    select: { id: true, platformBackup: true },
  })
  let queued = 0
  for (const org of organizations) {
    try {
      const allowed = platformBackupAllowed(await getFeatures(org.id))
      const row = org.platformBackup
      if (!allowed) {
        if (row && !row.pausedAt) {
          await db.platformBackup.update({
            where: { organizationId: org.id },
            data: { pausedAt: now },
          })
        } else if (
          row?.pausedAt &&
          !row.purgedAt &&
          now.getTime() - row.pausedAt.getTime() > PAUSED_GRACE_MS
        ) {
          await purgeRepository(org.id)
        }
        continue
      }
      if (row?.pausedAt) {
        await db.platformBackup.update({
          where: { organizationId: org.id },
          data: { pausedAt: null, purgedAt: null },
        })
      }
      const timeZone = await workshopTimeZone(org.id)
      // A workshop new to the cycle gets its first backup now, not at its
      // next slot: the restore points start from the day it joined.
      const slotDue =
        !row?.lastScheduledAt ||
        isDue(settings, row.lastScheduledAt, now, timeZone, backupOffsetMinutes(org.id))
      const retryDue = row?.retryAt !== null && row?.retryAt !== undefined && row.retryAt <= now
      if (slotDue || retryDue) {
        await db.platformBackup.upsert({
          where: { organizationId: org.id },
          create: { organizationId: org.id, lastScheduledAt: now },
          update: { retryAt: null, ...(slotDue ? { lastScheduledAt: now } : {}) },
        })
        try {
          await queueBackupRun({ kind: 'platform', organizationId: org.id }, 'scheduled')
          queued++
        } catch (err) {
          if (!(err instanceof BackupBusyError)) throw err
        }
      }
      if (row) await alertIfPlatformOverdue(org.id, row, now)
    } catch (err) {
      console.error(`[cron] platform backup for ${org.id} failed:`, err)
    }
  }
  return queued
}

/**
 * The repository of a workshop that left the plan more than the grace
 * period ago: every snapshot forgotten and the data pruned. The row stays,
 * marked, so the card can say what happened and the scheduler does not do it
 * again.
 */
async function purgeRepository(organizationId: string): Promise<void> {
  const target = await openPlatform(organizationId)
  const snapshots = await resticSnapshots(target.base, {
    host: platformHost(organizationId),
    tags: [],
  })
  await resticForgetSnapshots(
    target.base,
    snapshots.map((s) => s.id)
  )
  await db.platformBackup.update({
    where: { organizationId },
    data: { purgedAt: new Date(), snapshots: [], repositorySize: BigInt(0) },
  })
  console.warn(`[cron] platform repository of ${organizationId} purged after the grace period`)
}

/**
 * A platform repository with no good backup for a day and a half is our
 * problem before it is the workshop's: the operator is mailed once a day
 * (PLATFORM_BACKUP_ALERT_EMAIL), and the workshop's owners hear the same
 * way a destination's would.
 */
async function alertIfPlatformOverdue(
  organizationId: string,
  row: {
    lastScheduledAt: Date | null
    lastGoodAt: Date | null
    lastOverdueAlertAt: Date | null
    createdAt: Date
  },
  now: Date
): Promise<void> {
  if (!row.lastScheduledAt) return
  const reference = row.lastGoodAt ?? row.createdAt
  if (now.getTime() - reference.getTime() < PLATFORM_OVERDUE_MS) return
  if (
    row.lastOverdueAlertAt &&
    now.getTime() - row.lastOverdueAlertAt.getTime() < OVERDUE_ALERT_EVERY_MS
  ) {
    return
  }
  await db.platformBackup.update({ where: { organizationId }, data: { lastOverdueAlertAt: now } })
  console.error(
    `[cron] platform backup of ${organizationId} overdue; last good ${row.lastGoodAt?.toISOString() ?? 'never'}`
  )
  const operator = process.env.PLATFORM_BACKUP_ALERT_EMAIL?.trim()
  if (operator) {
    try {
      await sendMail({
        to: operator,
        from: process.env.SMTP_FROM_EMAIL || operator,
        subject: `Platform backup overdue: workshop ${organizationId}`,
        html: `<p>No platform backup of workshop <code>${organizationId}</code> has succeeded since ${row.lastGoodAt?.toISOString() ?? 'it was first scheduled'}.</p><p>See the Backups page on torqvoice.com admin for the failing runs.</p>`,
      })
    } catch (err) {
      console.error('[cron] could not mail the operator:', err)
    }
  }
  await reportOverdue(null, organizationId, row.lastGoodAt)
}

export function processBackupRuns() {
  let ticking = false
  let prunedAt = 0
  const job = new CronJob('*/5 * * * *', async () => {
    // A tick can outlast the five minutes while the queue drains; the next
    // tick waits its turn.
    if (ticking) return
    ticking = true
    try {
      const stale = await failStaleRuns()
      if (stale > 0) console.warn(`[cron] Marked ${stale} stale backup run(s) as failed`)
      const queued = (await processDueBackups()) + (await processDuePlatformBackups())
      if (queued > 0) console.warn(`[cron] Scheduled backups queued: ${queued}`)
      const ran = await drainBackupQueue()
      if (ran > 0) console.warn(`[cron] Backup runs finished: ${ran}`)
      // Old run rows go once a day, after the day's work, not on every tick.
      if (Date.now() - prunedAt > PRUNE_EVERY_MS) {
        prunedAt = Date.now()
        const pruned = await pruneOldRuns()
        if (pruned > 0) console.warn(`[cron] Pruned ${pruned} old backup run row(s)`)
      }
    } catch (err) {
      console.error('[cron] Backup scheduler failed:', err)
    } finally {
      ticking = false
    }
  })
  job.start()
  return job
}
