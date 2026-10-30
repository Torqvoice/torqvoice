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
import type {
  BackupKind,
  BackupRunView,
  BackupTrigger,
  PlatformSnapshotView,
} from '@/features/integrations/Lib/backup-types'
import { loadConnection, setConnectionStatus } from '@/features/integrations/Lib/connections'
import { connectorName } from '@/features/integrations/Lib/display-name'
import { organizationTranslator } from '@/i18n/organization-translator'
import { getManifest } from '@/integrations/registry'
import { db } from '@/lib/db'
import { getOrgFromAddress, sendOrgMail } from '@/lib/email'
import { getFeatures } from '@/lib/features'
import { notify } from '@/lib/notify'
import { orgUploadDir } from '@/lib/upload-root'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { writeBackupData } from './build-data'
import {
  PLATFORM_RETENTION,
  PRE_RESTORE_KEEP,
  PRE_RESTORE_TAG,
  platformBackupAllowed,
  platformBackupConfig,
  platformHost,
  platformRepository,
  platformTags,
} from './platform'
import { readBackupSettings } from './schedule'
import {
  ResticError,
  type ResticBaseOptions,
  type ResticSnapshot,
  resticBackup,
  resticCheck,
  resticForget,
  resticForgetOlderThan,
  resticInit,
  resticSnapshots,
  resticStats,
  resticUnlock,
} from './restic'
import type { RetentionPolicy } from './restic'
import { connectMessage, ensureCacheDir, repositoryPassword, sanitizeRepository } from './target'

/**
 * One backup run, end to end, for either kind of repository.
 *
 * A run is a `BackupRun` row. It is queued first, so the page and
 * torqvoice.com can show it; then `drainBackupQueue` works through the queued
 * rows oldest first, one at a time, behind the server-wide lock. A run that
 * finds the lock held stays queued and starts when the lock frees: nothing
 * is skipped, nothing runs in parallel. The cloud box is small and two restic
 * processes would fight over memory and the repository lock, and a restore
 * replaces the rows a backup would be reading.
 *
 * Two kinds of target: a destination the workshop connected (its own bucket
 * or folder, settings and keys on the connection), and the platform
 * repository Torqvoice keeps for it on the cloud instance (keys from the
 * environment, fixed settings, state on the workshop's `PlatformBackup` row).
 * The run itself is the same for both.
 */

const PRUNE_EVERY_MS = 7 * 24 * 60 * 60 * 1000
const CHECK_EVERY_MS = 30 * 24 * 60 * 60 * 1000
const FAILURE_MAIL_EVERY_MS = 24 * 60 * 60 * 1000
/** One retry after a failed scheduled run, before the next slot. */
export const RETRY_AFTER_MS = 30 * 60 * 1000

type Lock = { runId: string; since: number }
const g = globalThis as unknown as {
  __torqvoiceBackupLock?: Lock | null
  __torqvoiceBackupDraining?: boolean
}

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

/** Which repository a run is about. */
export type RunTarget =
  | { kind: 'destination'; connectionId: string }
  | { kind: 'platform'; organizationId: string }

/**
 * A target opened for a run: the repository, how to sign in, what to put in
 * a snapshot, what to keep, and where the run's bookkeeping goes.
 */
export interface OpenedTarget {
  kind: BackupKind
  organizationId: string
  connectionId: string | null
  base: ResticBaseOptions
  host: string
  tags(trigger: string): string[]
  includeFiles: boolean
  includeSecrets: boolean
  retention: RetentionPolicy
  /** Last prune and check times, and the repository size, as the target keeps them. */
  state: { lastPruneAt: Date | null; lastCheckAt: Date | null }
  log(level: 'info' | 'error', message: string, details?: Record<string, unknown>): Promise<void>
  /** Record a good run: when, how big, and (platform) the restore points now in the repository. */
  recordGood(data: {
    at: Date
    totalBytes: number | null
    snapshots: ResticSnapshot[] | null
    prunedAt: Date | null
    checkedAt: Date | null
  }): Promise<void>
  /** Record a failure of a scheduled run, so one retry follows. */
  recordRetry(at: Date): Promise<void>
  /**
   * Platform only: replace the restore points listed for the workshop, without
   * marking a good run. Used after a safety copy, so it can be restored at once.
   */
  recordSnapshots?(snapshots: ResticSnapshot[]): Promise<void>
}

function toRunTarget(run: {
  kind: string
  connectionId: string | null
  organizationId: string
}): RunTarget {
  if (run.kind === 'platform') return { kind: 'platform', organizationId: run.organizationId }
  if (!run.connectionId) throw new Error('This destination run names no connection')
  return { kind: 'destination', connectionId: run.connectionId }
}

async function openDestination(connectionId: string): Promise<OpenedTarget> {
  const { ctx, server } = await loadConnection(connectionId)
  if (!server.backupTarget) throw new Error('This integration is not a backup destination')
  const organizationId = ctx.connection.organizationId
  const settings = readBackupSettings(ctx.connection.settings)
  const repo = sanitizeRepository(await server.backupTarget.repository(ctx))
  const password = repositoryPassword(ctx)
  const cacheDir = await ensureCacheDir(organizationId)
  const state = ctx.connection.state
  return {
    kind: 'destination',
    organizationId,
    connectionId,
    base: { repository: repo, password, cacheDir },
    host: backupHost(organizationId),
    tags: (trigger) => [backupTag(organizationId), trigger],
    includeFiles: settings.includeFiles,
    includeSecrets: settings.contents === 'dataAndSecrets',
    retention: settings,
    state: {
      lastPruneAt: stateDate(state, BACKUP_STATE.lastPruneAt),
      lastCheckAt: stateDate(state, BACKUP_STATE.lastCheckAt),
    },
    log: (level, message, details) => ctx.log(level, message, details),
    async recordGood({ at, totalBytes, prunedAt, checkedAt }) {
      const patch: Record<string, unknown> = { [BACKUP_STATE.lastGoodAt]: at.toISOString() }
      if (prunedAt) patch[BACKUP_STATE.lastPruneAt] = prunedAt.toISOString()
      if (checkedAt) patch[BACKUP_STATE.lastCheckAt] = checkedAt.toISOString()
      if (totalBytes !== null) patch[BACKUP_STATE.repositorySize] = totalBytes
      await ctx.saveState(patch)
      await setConnectionStatus(connectionId, 'active')
    },
    async recordRetry(at) {
      await ctx.saveState({ [BACKUP_STATE.retryAt]: at.toISOString() })
    },
  }
}

/**
 * The platform repository of one workshop. Opened only when platform backups
 * are configured on this server; the plan is the scheduler's business, so a
 * restore can still read the repository of a workshop that dropped to Free
 * during its grace period.
 */
export async function openPlatform(organizationId: string): Promise<OpenedTarget> {
  const config = platformBackupConfig()
  if (!config) throw new Error('Platform backups are not configured on this server')
  const { repository, password } = platformRepository(config, organizationId)
  const cacheDir = await ensureCacheDir(organizationId)
  const row = await db.platformBackup.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  })
  return {
    kind: 'platform',
    organizationId,
    connectionId: null,
    base: { repository, password, cacheDir },
    host: platformHost(organizationId),
    tags: (trigger) => platformTags(organizationId, trigger),
    includeFiles: true,
    includeSecrets: true,
    retention: PLATFORM_RETENTION,
    state: { lastPruneAt: row.lastPruneAt, lastCheckAt: row.lastCheckAt },
    async log(level, message, details) {
      const line = `[platform-backup] ${organizationId}: ${message}`
      if (level === 'error') console.error(line, details ?? '')
      else console.warn(line, details ?? '')
    },
    async recordGood({ at, totalBytes, snapshots, prunedAt, checkedAt }) {
      await db.platformBackup.update({
        where: { organizationId },
        data: {
          lastGoodAt: at,
          ...(prunedAt ? { lastPruneAt: prunedAt } : {}),
          ...(checkedAt ? { lastCheckAt: checkedAt } : {}),
          ...(totalBytes !== null ? { repositorySize: BigInt(Math.round(totalBytes)) } : {}),
          ...(snapshots ? { snapshots: snapshotViews(snapshots) as object } : {}),
          retryAt: null,
        },
      })
    },
    async recordRetry(at) {
      await db.platformBackup.update({ where: { organizationId }, data: { retryAt: at } })
    },
    async recordSnapshots(snapshots) {
      await db.platformBackup.update({
        where: { organizationId },
        data: { snapshots: snapshotViews(snapshots) as object },
      })
    },
  }
}

export async function openTarget(target: RunTarget): Promise<OpenedTarget> {
  return target.kind === 'platform'
    ? openPlatform(target.organizationId)
    : openDestination(target.connectionId)
}

/** The restore points as the card and torqvoice.com list them, newest first. */
export function snapshotViews(snapshots: ResticSnapshot[]): PlatformSnapshotView[] {
  return snapshots
    .filter((s) => !s.tags.includes('torqvoice-probe'))
    .map((s) => ({
      id: s.id,
      shortId: s.shortId,
      time: s.time,
      bytes: s.summary ? s.summary.totalBytesProcessed : null,
      trigger: s.tags.includes('scheduled')
        ? ('scheduled' as const)
        : s.tags.includes('manual')
          ? ('manual' as const)
          : null,
      preRestore: s.tags.includes(PRE_RESTORE_TAG),
    }))
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
}

/**
 * Queue a run. Refuses when one is queued or running for the same target
 * already, so a double click or an overlapping cron tick cannot start two.
 * The caller then calls `drainBackupQueue` (or lets the next tick do it). A
 * restore names the snapshot it will put back and who asked for it.
 */
export async function queueBackupRun(
  target: RunTarget | string,
  trigger: BackupTrigger,
  extra: { snapshotId?: string; requestedBy?: string | null; reason?: string | null } = {}
): Promise<{ runId: string }> {
  const t: RunTarget =
    typeof target === 'string' ? { kind: 'destination', connectionId: target } : target
  let organizationId: string
  let connectionId: string | null = null
  if (t.kind === 'destination') {
    const row = await db.integrationConnection.findUnique({
      where: { id: t.connectionId },
      select: { organizationId: true, connectorId: true },
    })
    if (!row) throw new Error('Integration connection not found')
    const manifest = getManifest(row.connectorId)
    if (!manifest?.capabilities.includes(BACKUP_CAPABILITY)) {
      throw new Error('This integration is not a backup destination')
    }
    organizationId = row.organizationId
    connectionId = t.connectionId
  } else {
    if (!platformBackupConfig())
      throw new Error('Platform backups are not configured on this server')
    organizationId = t.organizationId
  }
  const open = await db.backupRun.findFirst({
    where: {
      organizationId,
      kind: t.kind,
      ...(connectionId ? { connectionId } : {}),
      status: { in: ['queued', 'running'] },
    },
    select: { id: true },
  })
  if (open) throw new BackupBusyError()
  const run = await db.backupRun.create({
    data: {
      organizationId,
      kind: t.kind,
      connectionId,
      trigger,
      status: 'queued',
      snapshotId: extra.snapshotId ?? null,
      requestedBy: extra.requestedBy ?? null,
      reason: extra.reason?.slice(0, 500) ?? null,
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
    safetySnapshotId?: string | null
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

function stateDate(state: Record<string, unknown>, key: string): Date | null {
  const v = state[key]
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * The workshop's rows, streamed to the staging file. Secret keys stay out
 * unless asked for. Returns the staging folder restic reads.
 */
export async function stageBackupData(
  organizationId: string,
  includeSecrets: boolean
): Promise<{ staging: string; dataFile: string }> {
  const staging = stagingDirFor(organizationId)
  const dataFile = path.join(staging, 'data.json')
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
      includeSecrets,
    },
    out
  )
  out.end()
  await finished(out)
  return { staging, dataFile }
}

/** The paths one snapshot covers: the staging folder, and the uploads folder when wanted and present. */
async function snapshotPaths(organizationId: string, staging: string, includeFiles: boolean) {
  const paths = [staging]
  if (includeFiles) {
    const uploads = orgUploadDir(organizationId)
    const exists = await stat(uploads)
      .then((s) => s.isDirectory())
      .catch(() => false)
    if (exists) paths.push(uploads)
  }
  return paths
}

async function prepareRepository(target: OpenedTarget): Promise<void> {
  const repo = target.base.repository
  if (!repo.repository.startsWith('s3:')) await mkdir(repo.repository, { recursive: true })
  await resticInit(target.base)
  await resticUnlock(target.base)
}

/**
 * One snapshot of the workshop into a target, without the run bookkeeping.
 * The engine's own runs and the safety copy a restore takes both use it.
 * The caller holds the backup lock.
 */
export async function takeSnapshot(
  target: OpenedTarget,
  trigger: string,
  options: { includeSecrets?: boolean; includeFiles?: boolean } = {}
) {
  const { staging, dataFile } = await stageBackupData(
    target.organizationId,
    options.includeSecrets ?? target.includeSecrets
  )
  try {
    const paths = await snapshotPaths(
      target.organizationId,
      staging,
      options.includeFiles ?? target.includeFiles
    )
    await prepareRepository(target)
    return await resticBackup(target.base, { paths, host: target.host, tags: target.tags(trigger) })
  } finally {
    await rm(dataFile, { force: true }).catch((err) =>
      console.warn('[backup] could not remove the staging file:', err)
    )
  }
}

/**
 * The safety copy taken right before a restore replaces the workshop: into
 * the platform repository when this workshop has one, else into the
 * repository the restore reads from (a self-hosted install restoring from its
 * own destination). The uploads folder always goes in, whatever the
 * destination is set to keep, so undoing a restore of an older snapshot that
 * had files gives the photos back too. Into our own repository the secret
 * keys go too, so undoing the restore gives back exactly what was there; into
 * the workshop's own storage only the secrets the workshop chose to keep
 * there. In our own repository the restore points listed on the Backups card
 * are refreshed right after, so the safety copy can be restored at once (a
 * failure to list them is logged and does not stop the restore). Throws when
 * the copy cannot be taken; the restore then does not start.
 */
export async function takeSafetySnapshot(
  organizationId: string,
  fallback: OpenedTarget
): Promise<{ snapshotId: string; kind: BackupKind }> {
  let target = fallback
  if (platformBackupConfig()) {
    const features = await getFeatures(organizationId)
    if (platformBackupAllowed(features)) target = await openPlatform(organizationId)
  }
  const result = await takeSnapshot(target, PRE_RESTORE_TAG, {
    includeSecrets: target.kind === 'platform' ? true : target.includeSecrets,
    includeFiles: true,
  })
  await target.log('info', 'Safety copy taken before a restore', { snapshot: result.snapshotId })
  if (target.kind === 'platform' && target.recordSnapshots) {
    try {
      const snapshots = await resticSnapshots(target.base, {
        host: target.host,
        tags: [backupTag(organizationId)],
      })
      await target.recordSnapshots(snapshots)
    } catch (err) {
      await target.log('error', 'Could not list the restore points after the safety copy', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { snapshotId: result.snapshotId, kind: target.kind }
}

/**
 * Run a queued backup. Returns the row; never throws for a backup failure.
 * While another run holds the lock the row stays queued and comes back as it
 * is, for `drainBackupQueue` to start later.
 */
export async function runBackup(runId: string): Promise<BackupRunView> {
  const run = await db.backupRun.findUnique({ where: { id: runId } })
  if (!run) throw new Error('Backup run not found')
  if (run.status !== 'queued') return runView(run)
  if (run.trigger === 'restore') {
    return finishRun(runId, { status: 'failed', error: 'This run is a restore' })
  }
  if (!acquireBackupLock(runId)) return runView(run)

  const organizationId = run.organizationId
  let target: OpenedTarget | null = null
  try {
    await db.backupRun.update({
      where: { id: runId },
      data: { status: 'running', startedAt: new Date() },
    })
    // The plan is checked by whoever queued the run; checked again here so
    // a row inserted some other way never starts a repository for a
    // workshop outside the plan. A restore during the grace period is not
    // a backup and does not come through here.
    if (run.kind === 'platform' && !platformBackupAllowed(await getFeatures(organizationId))) {
      throw new Error('Backups by Torqvoice are not in this workshop\u2019s plan')
    }
    target = await openTarget(toRunTarget(run))
    if (target.organizationId !== organizationId) {
      throw new Error('The destination belongs to another workshop')
    }

    const result = await takeSnapshot(target, run.trigger)
    await target.log('info', 'Backup finished', {
      snapshot: result.snapshotId,
      filesNew: result.filesNew,
      dataAdded: result.dataAdded,
    })

    // Retention after every run; the expensive prune once a week, the
    // read-back check once a month. Safety copies are kept whatever the
    // policy says, for ninety days.
    const now = new Date()
    const prune = now.getTime() - (target.state.lastPruneAt?.getTime() ?? 0) > PRUNE_EVERY_MS
    const ownTags = [backupTag(organizationId)]
    await resticForget(target.base, {
      host: target.host,
      tags: ownTags,
      ...target.retention,
      keepTags: [PRE_RESTORE_TAG],
      prune: false,
    })
    await resticForgetOlderThan(target.base, {
      host: target.host,
      tag: PRE_RESTORE_TAG,
      keepWithin: PRE_RESTORE_KEEP,
    })
    if (prune) {
      await resticForget(target.base, {
        host: target.host,
        tags: ownTags,
        ...target.retention,
        keepTags: [PRE_RESTORE_TAG],
        prune: true,
      })
    }
    let checkedAt: Date | null = null
    if (now.getTime() - (target.state.lastCheckAt?.getTime() ?? 0) > CHECK_EVERY_MS) {
      try {
        await resticCheck(target.base, { readDataSubset: '2%' })
        checkedAt = now
      } catch (err) {
        await target.log('error', 'Repository check found a problem', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    let totalBytes: number | null = null
    try {
      const stats = await resticStats(target.base, { host: target.host, tags: ownTags })
      totalBytes = stats.totalSize
    } catch {
      // Size is a nicety on the page; a failed stats call is not a failed backup.
    }
    let snapshots: ResticSnapshot[] | null = null
    if (target.kind === 'platform') {
      try {
        snapshots = await resticSnapshots(target.base, { host: target.host, tags: ownTags })
      } catch (err) {
        await target.log('error', 'Could not list the restore points', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    await target.recordGood({
      at: now,
      totalBytes,
      snapshots,
      prunedAt: prune ? now : null,
      checkedAt,
    })
    return await finishRun(runId, {
      status: 'done',
      snapshotId: result.snapshotId,
      filesNew: result.filesNew,
      bytesAdded: BigInt(Math.round(result.dataAdded)),
      ...(totalBytes !== null ? { totalBytes: BigInt(Math.round(totalBytes)) } : {}),
    })
  } catch (err) {
    const message = describeFailure(err)
    console.error(`[backup] run ${runId} failed:`, message)
    const view = await finishRun(runId, { status: 'failed', error: message })
    if (run.trigger === 'scheduled') {
      await bookRetry(run, target, new Date(Date.now() + RETRY_AFTER_MS)).catch((e) =>
        console.error('[backup] could not schedule the retry:', e)
      )
    }
    await reportFailure(run.kind as BackupKind, run.connectionId, organizationId, message).catch(
      (e) => console.error('[backup] could not report the failure:', e)
    )
    return view
  } finally {
    releaseBackupLock(runId)
    void drainBackupQueue().catch((err) => console.error('[backup] drain failed:', err))
  }
}

/**
 * One retry half an hour on after a failed scheduled run, booked on the
 * target when it opened and straight on the row when it did not (bad keys,
 * a connector that threw): a destination that cannot be opened is exactly
 * the one whose retry must not be forgotten.
 */
async function bookRetry(
  run: { kind: string; connectionId: string | null; organizationId: string },
  target: OpenedTarget | null,
  at: Date
): Promise<void> {
  if (target) {
    await target.recordRetry(at)
    return
  }
  if (run.kind === 'platform') {
    await db.platformBackup.update({
      where: { organizationId: run.organizationId },
      data: { retryAt: at },
    })
    return
  }
  if (!run.connectionId) return
  const row = await db.integrationConnection.findUnique({
    where: { id: run.connectionId },
    select: { state: true },
  })
  if (!row) return
  await db.integrationConnection.update({
    where: { id: run.connectionId },
    data: {
      state: {
        ...((row.state as Record<string, unknown>) ?? {}),
        [BACKUP_STATE.retryAt]: at.toISOString(),
      } as object,
    },
  })
}

/**
 * Work through the queued runs, oldest first, one at a time, until none is
 * left or another run holds the lock (its own finish drains again). Safe to
 * call from anywhere: a second caller while one is draining returns at once.
 */
export async function drainBackupQueue(): Promise<number> {
  if (g.__torqvoiceBackupDraining) return 0
  g.__torqvoiceBackupDraining = true
  let ran = 0
  try {
    for (;;) {
      if (backupLockHolder()) break
      const next = await db.backupRun.findFirst({
        where: { status: 'queued' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, trigger: true },
      })
      if (!next) break
      let view: BackupRunView
      if (next.trigger === 'restore') {
        const { runRestore } = await import('./restore')
        view = await runRestore(next.id)
      } else {
        view = await runBackup(next.id)
      }
      // Still queued means the lock was taken under us; its holder drains next.
      if (view.status === 'queued') break
      ran++
    }
  } finally {
    g.__torqvoiceBackupDraining = false
  }
  return ran
}

function describeFailure(err: unknown): string {
  if (err instanceof ResticError) return connectMessage(err)
  return err instanceof Error ? err.message : String(err)
}

/**
 * The words an alert is written in: the workshop's language, and the
 * repository's name in it.
 */
async function alertWords(organizationId: string, connectorId: string | null) {
  const t = await organizationTranslator(organizationId, 'integrations')
  const manifest = connectorId ? getManifest(connectorId) : null
  const name = manifest
    ? connectorName(t, manifest)
    : connectorId
      ? t('backupAlerts.destination')
      : t('backupAlerts.platformName')
  return { t, name }
}

/**
 * A failed backup is told to the people who can fix it: an in-app
 * notification every time, an email at most once a day per repository. A
 * failed platform run is ours to fix, so the workshop only hears about it
 * when it has gone on long enough to matter (the overdue alert); the log and
 * torqvoice.com see every one.
 */
async function reportFailure(
  kind: BackupKind,
  connectionId: string | null,
  organizationId: string,
  message: string
): Promise<void> {
  if (kind === 'platform' || !connectionId) return
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
  const last = stateDate(state, BACKUP_STATE.lastFailureMailAt)?.getTime() ?? 0
  if (Date.now() - last < FAILURE_MAIL_EVERY_MS) return
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
  connectionId: string | null,
  organizationId: string,
  lastGoodAt: Date | null
): Promise<void> {
  let connectorId: string | null = null
  if (connectionId) {
    const connection = await db.integrationConnection.findUnique({
      where: { id: connectionId },
      select: { connectorId: true },
    })
    if (!connection) return
    connectorId = connection.connectorId
  }
  const { t, name } = await alertWords(organizationId, connectorId)
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
  const entityUrl = connectorId ? `/settings/integrations/${connectorId}` : '/settings/data'
  await notify({
    organizationId,
    type: 'backup_overdue',
    title: t('backupAlerts.overdueTitle'),
    message: sentence,
    entityType: connectionId ? 'IntegrationConnection' : 'PlatformBackup',
    entityId: connectionId ?? organizationId,
    entityUrl,
  })
  await mailAdmins(
    organizationId,
    t('backupAlerts.overdueSubject', { name }),
    `<p>${escapeHtml(sentence)}</p><p>${escapeHtml(t('backupAlerts.openToSee', { name }))}</p>`
  )
}

/** The owners and administrators of a workshop, mailed about its backups. */
export async function mailAdmins(
  organizationId: string,
  subject: string,
  html: string
): Promise<void> {
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

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
