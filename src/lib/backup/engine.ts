import { createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { finished } from 'node:stream/promises'
import {
  BACKUP_CAPABILITY,
  BACKUP_STATE,
  backupHost,
  backupTag,
  runView,
} from '@/features/integrations/Lib/backup'
import type { BackupRunView, BackupTrigger } from '@/features/integrations/Lib/backup-types'
import { loadConnection, setConnectionStatus } from '@/features/integrations/Lib/connections'
import { connectorName } from '@/features/integrations/Lib/display-name'
import { organizationTranslator } from '@/i18n/organization-translator'
import { getManifest } from '@/integrations/registry'
import { db } from '@/lib/db'
import { getOrgFromAddress, sendOrgMail } from '@/lib/email'
import { notify } from '@/lib/notify'
import { orgUploadDir } from '@/lib/upload-root'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { writeBackupData } from './build-data'
import { readBackupSettings } from './schedule'
import {
  ResticError,
  resticBackup,
  resticCheck,
  resticForget,
  resticInit,
  resticStats,
  resticUnlock,
} from './restic'
import { connectMessage, ensureCacheDir, repositoryPassword, sanitizeRepository } from './target'

/**
 * One backup run, end to end.
 *
 * The run row is created first (queued) so the page can show it, then
 * `runBackup` claims the server-wide lock, writes the workshop's data to a
 * staging file, has restic take a snapshot of that file and the upload
 * folder, applies retention, and records the outcome. One run at a time per
 * server: the cloud box is small and two restic processes would fight over
 * memory and the repository lock.
 */

const PRUNE_EVERY_MS = 7 * 24 * 60 * 60 * 1000
const CHECK_EVERY_MS = 30 * 24 * 60 * 60 * 1000
const FAILURE_MAIL_EVERY_MS = 24 * 60 * 60 * 1000

type Lock = { runId: string; since: number }
const g = globalThis as unknown as { __torqvoiceBackupLock?: Lock | null }

export function backupLockHolder(): Lock | null {
  return g.__torqvoiceBackupLock ?? null
}

/**
 * The server-wide lock a backup or a restore holds while it runs. Shared
 * between the two: a restore replaces the rows a backup would be reading.
 */
export function acquireBackupLock(runId: string): boolean {
  if (g.__torqvoiceBackupLock) return false
  g.__torqvoiceBackupLock = { runId, since: Date.now() }
  return true
}

export function releaseBackupLock(runId: string): void {
  if (g.__torqvoiceBackupLock?.runId === runId) g.__torqvoiceBackupLock = null
}

export class BackupBusyError extends Error {
  constructor() {
    super('A backup is already running')
  }
}

/**
 * Where the data file for one workshop is staged for restic: a fixed path
 * under os.tmpdir(), so an unchanged file reads as unchanged run after run,
 * and deleted after each run so a plain copy of the database never lingers.
 */
export function stagingDirFor(organizationId: string): string {
  if (!/^[a-z0-9]+$/i.test(organizationId)) throw new Error('Unexpected organisation id')
  return path.join(os.tmpdir(), 'torqvoice-backup-staging', organizationId)
}

/**
 * Queue a run for a connection. Refuses when one is queued or running for
 * it already, so a double click or an overlapping cron tick cannot start
 * two. The caller decides whether to await `runBackup` or let it go. A
 * restore names the snapshot it will put back.
 */
export async function queueBackupRun(
  connectionId: string,
  trigger: BackupTrigger,
  extra: { snapshotId?: string } = {}
): Promise<{ runId: string }> {
  const open = await db.backupRun.findFirst({
    where: { connectionId, status: { in: ['queued', 'running'] } },
    select: { id: true },
  })
  if (open) throw new BackupBusyError()
  const row = await db.integrationConnection.findUnique({
    where: { id: connectionId },
    select: { organizationId: true, connectorId: true },
  })
  if (!row) throw new Error('Integration connection not found')
  const manifest = getManifest(row.connectorId)
  if (!manifest?.capabilities.includes(BACKUP_CAPABILITY)) {
    throw new Error('This integration is not a backup destination')
  }
  const run = await db.backupRun.create({
    data: {
      organizationId: row.organizationId,
      connectionId,
      trigger,
      status: 'queued',
      snapshotId: extra.snapshotId ?? null,
    },
    select: { id: true },
  })
  return { runId: run.id }
}

/** Records how a run ended, and returns the row as the page shows it. */
export async function finishRun(
  runId: string,
  data: {
    status: 'done' | 'failed' | 'skipped'
    error?: string | null
    snapshotId?: string
    filesNew?: number
    bytesAdded?: bigint
    totalBytes?: bigint
  }
): Promise<BackupRunView> {
  const row = await db.backupRun.update({
    where: { id: runId },
    data: { ...data, error: data.error?.slice(0, 1000) ?? null, finishedAt: new Date() },
  })
  return runView(row)
}

function stateMs(state: Record<string, unknown>, key: string): number {
  const v = state[key]
  if (typeof v !== 'string') return 0
  const t = new Date(v).getTime()
  return Number.isNaN(t) ? 0 : t
}

/** Run a queued backup. Returns the finished row; never throws for a backup failure. */
export async function runBackup(runId: string): Promise<BackupRunView> {
  const run = await db.backupRun.findUnique({ where: { id: runId } })
  if (!run) throw new Error('Backup run not found')
  if (run.status !== 'queued') return runView(run)

  if (!acquireBackupLock(runId)) {
    return finishRun(runId, {
      status: 'skipped',
      error: 'Another backup was running; this one was skipped',
    })
  }

  const organizationId = run.organizationId
  // Set inside the try, so a refused organisation id still releases the lock.
  let dataFile: string | null = null
  try {
    await db.backupRun.update({
      where: { id: runId },
      data: { status: 'running', startedAt: new Date() },
    })
    const staging = stagingDirFor(organizationId)
    dataFile = path.join(staging, 'data.json')
    const { ctx, server } = await loadConnection(run.connectionId)
    if (!server.backupTarget) throw new Error('This integration is not a backup destination')
    const settings = readBackupSettings(ctx.connection.settings)
    const repo = sanitizeRepository(await server.backupTarget.repository(ctx))
    const password = repositoryPassword(ctx)
    const cacheDir = await ensureCacheDir(organizationId)
    const base = { repository: repo, password, cacheDir }

    // The workshop's rows, streamed to one file. Secret keys stay out unless
    // the workshop chose to include them.
    await mkdir(staging, { recursive: true, mode: 0o700 })
    const out = createWriteStream(dataFile, { mode: 0o600 })
    await writeBackupData(
      organizationId,
      {
        settings: true,
        customers: true,
        vehicles: true,
        quotes: true,
        inventory: true,
        customFields: true,
        files: false,
        technicians: true,
        inspections: true,
        auditLogs: true,
        smsMessages: true,
        scheduledMessages: true,
        notifications: true,
        tireHotel: true,
        workshopConfig: true,
        includeSecrets: settings.contents === 'dataAndSecrets',
      },
      out
    )
    out.end()
    await finished(out)

    const paths = [staging]
    if (settings.includeFiles) {
      const uploads = orgUploadDir(organizationId)
      const exists = await stat(uploads)
        .then((s) => s.isDirectory())
        .catch(() => false)
      if (exists) paths.push(uploads)
    }

    if (!repo.repository.startsWith('s3:')) await mkdir(repo.repository, { recursive: true })
    await resticInit(base)
    await resticUnlock(base)
    const host = backupHost(organizationId)
    const tags = [backupTag(organizationId), run.trigger]
    const result = await resticBackup(base, { paths, host, tags })
    await ctx.log('info', 'Backup finished', {
      snapshot: result.snapshotId,
      filesNew: result.filesNew,
      dataAdded: result.dataAdded,
    })

    // Retention after every run; the expensive prune once a week, the
    // read-back check once a month.
    const state = ctx.connection.state
    const now = Date.now()
    const prune = now - stateMs(state, BACKUP_STATE.lastPruneAt) > PRUNE_EVERY_MS
    await resticForget(base, {
      host,
      tags: [backupTag(organizationId)],
      keepHourly: settings.keepHourly,
      keepDaily: settings.keepDaily,
      keepWeekly: settings.keepWeekly,
      keepMonthly: settings.keepMonthly,
      prune,
    })
    const patch: Record<string, unknown> = {
      [BACKUP_STATE.lastGoodAt]: new Date(now).toISOString(),
    }
    if (prune) patch[BACKUP_STATE.lastPruneAt] = new Date(now).toISOString()
    if (now - stateMs(state, BACKUP_STATE.lastCheckAt) > CHECK_EVERY_MS) {
      try {
        await resticCheck(base, { readDataSubset: '2%' })
        patch[BACKUP_STATE.lastCheckAt] = new Date(now).toISOString()
      } catch (err) {
        await ctx.log('error', 'Repository check found a problem', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    let totalBytes: bigint | undefined
    try {
      const stats = await resticStats(base, { host, tags: [backupTag(organizationId)] })
      totalBytes = BigInt(Math.round(stats.totalSize))
      patch[BACKUP_STATE.repositorySize] = stats.totalSize
    } catch {
      // Size is a nicety on the page; a failed stats call is not a failed backup.
    }
    await ctx.saveState(patch)
    await setConnectionStatus(run.connectionId, 'active')
    return await finishRun(runId, {
      status: 'done',
      snapshotId: result.snapshotId,
      filesNew: result.filesNew,
      bytesAdded: BigInt(Math.round(result.dataAdded)),
      totalBytes,
    })
  } catch (err) {
    const message = describeFailure(err)
    console.error(`[backup] run ${runId} failed:`, message)
    const view = await finishRun(runId, { status: 'failed', error: message })
    await reportFailure(run.connectionId, organizationId, message).catch((e) =>
      console.error('[backup] could not report the failure:', e)
    )
    return view
  } finally {
    if (dataFile) {
      await rm(dataFile, { force: true }).catch((err) =>
        console.warn('[backup] could not remove the staging file:', err)
      )
    }
    releaseBackupLock(runId)
  }
}

function describeFailure(err: unknown): string {
  if (err instanceof ResticError) return connectMessage(err)
  return err instanceof Error ? err.message : String(err)
}

/**
 * The words an alert is written in: the workshop's language, and the
 * destination's name in it.
 */
async function alertWords(organizationId: string, connectorId: string) {
  const t = await organizationTranslator(organizationId, 'integrations')
  const manifest = getManifest(connectorId)
  const name = manifest ? connectorName(t, manifest) : t('backupAlerts.destination')
  return { t, name }
}

/**
 * A failed backup is told to the people who can fix it: an in-app
 * notification every time, an email at most once a day per destination.
 */
async function reportFailure(
  connectionId: string,
  organizationId: string,
  message: string
): Promise<void> {
  const connection = await db.integrationConnection.findUnique({
    where: { id: connectionId },
    select: { connectorId: true, state: true },
  })
  if (!connection) return
  const { t, name } = await alertWords(organizationId, connection.connectorId)
  await setConnectionStatus(connectionId, 'error', message)
  await notify({
    organizationId,
    type: 'backup_failed',
    title: t('backupAlerts.failedTitle'),
    message: t('backupAlerts.failedMessage', { name, reason: message }),
    entityType: 'IntegrationConnection',
    entityId: connectionId,
    entityUrl: `/settings/integrations/${connection.connectorId}`,
  })
  const state = (connection.state as Record<string, unknown>) ?? {}
  if (Date.now() - stateMs(state, BACKUP_STATE.lastFailureMailAt) < FAILURE_MAIL_EVERY_MS) return
  await db.integrationConnection.update({
    where: { id: connectionId },
    data: {
      state: { ...state, [BACKUP_STATE.lastFailureMailAt]: new Date().toISOString() } as object,
    },
  })
  await mailAdmins(
    organizationId,
    t('backupAlerts.failedSubject', { name }),
    `<p>${escapeHtml(t('backupAlerts.failedEmailIntro', { name }))}</p><p>${escapeHtml(message)}</p><p>${escapeHtml(t('backupAlerts.openToRetry', { name }))}</p>`
  )
}

/** The overdue alert the cron sends when no backup has succeeded for too long. */
export async function reportOverdue(
  connectionId: string,
  organizationId: string,
  lastGoodAt: Date | null
): Promise<void> {
  const connection = await db.integrationConnection.findUnique({
    where: { id: connectionId },
    select: { connectorId: true },
  })
  if (!connection) return
  const { t, name } = await alertWords(organizationId, connection.connectorId)
  // The last good time on the workshop's clock, in its language.
  const sentence = lastGoodAt
    ? t('backupAlerts.overdueSince', {
        name,
        time: new Intl.DateTimeFormat(t.locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: await workshopTimeZone(organizationId),
        }).format(lastGoodAt),
      })
    : t('backupAlerts.overdueNever', { name })
  await notify({
    organizationId,
    type: 'backup_overdue',
    title: t('backupAlerts.overdueTitle'),
    message: sentence,
    entityType: 'IntegrationConnection',
    entityId: connectionId,
    entityUrl: `/settings/integrations/${connection.connectorId}`,
  })
  await mailAdmins(
    organizationId,
    t('backupAlerts.overdueSubject', { name }),
    `<p>${escapeHtml(sentence)}</p><p>${escapeHtml(t('backupAlerts.openToSee', { name }))}</p>`
  )
}

async function mailAdmins(organizationId: string, subject: string, html: string): Promise<void> {
  const members = await db.organizationMember.findMany({
    where: { organizationId, role: { in: ['owner', 'admin'] } },
    select: { user: { select: { email: true } } },
  })
  const recipients = members.map((m) => m.user?.email).filter((e): e is string => Boolean(e))
  if (recipients.length === 0) return
  let from: string
  try {
    from = await getOrgFromAddress(organizationId)
  } catch {
    return
  }
  for (const to of recipients) {
    try {
      await sendOrgMail(organizationId, { to, from, subject, html })
    } catch (err) {
      console.error('[backup] alert email failed:', err)
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
