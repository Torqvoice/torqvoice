import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { backupHost, backupTag, runView } from '@/features/integrations/Lib/backup'
import type { BackupRunView, BackupSnapshotView } from '@/features/integrations/Lib/backup-types'
import { organizationTranslator } from '@/i18n/organization-translator'
import { getManifest } from '@/integrations/registry'
import { logAudit } from '@/lib/audit'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { dataRoot } from '@/lib/upload-root'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import {
  acquireBackupLock,
  drainBackupQueue,
  escapeHtml,
  finishRun,
  mailAdmins,
  type OpenedTarget,
  openTarget,
  queueBackupRun,
  releaseBackupLock,
  type RunTarget,
  takeSafetySnapshot,
} from './engine'
import { closeRestorePoints } from './explore'
import { freezeOrganization, renewFreeze, unfreezeOrganization } from './freeze'
import { restoreFromDisk } from './import'
import { ResticError, resticRestore, resticSnapshots } from './restic'
import { connectMessage } from './target'

/**
 * Putting a snapshot back into the workshop, from a destination it connected
 * or from the platform repository Torqvoice keeps for it.
 *
 * `listSnapshots` is what the Restore section of a destination shows (the
 * platform repository's restore points are stored after each run instead).
 * `queueRestore` makes the run row, with the same refusals as a backup, and
 * `runRestore` does the work, in this order: the workshop is put in its
 * read-only state, a safety copy of it as it is now is taken, restic writes
 * the snapshot to a temporary folder under the data root, the restored
 * `data.json` and uploads folder go through the same import the uploaded zip
 * uses, and the folder is removed whichever way it ends. Should the safety
 * copy fail, nothing is replaced. The server-wide lock is the backup's, so a
 * backup never reads rows a restore is replacing.
 */

/** How deep under the restore folder the backup's paths are looked for. */
const MAX_DEPTH = 16

/** How often a running restore renews the workshop's freeze. */
const FREEZE_RENEW_MS = 5 * 60 * 1000

/** Where one restore is written out: a folder of its own under the data root. */
export function restoreDirFor(organizationId: string, runId: string): string {
  if (!/^[a-z0-9]+$/i.test(organizationId) || !/^[a-z0-9]+$/i.test(runId)) {
    throw new Error('Unexpected id')
  }
  return path.join(dataRoot(), 'restore-tmp', `${organizationId}-${runId}`)
}

function snapshotTrigger(tags: string[]): BackupSnapshotView['trigger'] {
  if (tags.includes('scheduled')) return 'scheduled'
  if (tags.includes('manual')) return 'manual'
  return null
}

/** The tiny snapshot a connection check writes and forgets again. */
const PROBE_TAG = 'torqvoice-probe'

/**
 * The snapshots at a destination, newest first. A repository holds one
 * workshop's backups, but not always under this workshop's id: a workshop
 * set up again on a new server connects the same storage with the same
 * password, and what the old install wrote is what it wants back. So every
 * snapshot is listed, with the ones this workshop took marked as such. The
 * engine backs up the staged data file and, when chosen, the uploads
 * folder, so a snapshot with two paths is one that carries photos and files.
 */
export async function listSnapshots(connectionId: string): Promise<BackupSnapshotView[]> {
  const { organizationId, base } = await openTarget({ kind: 'destination', connectionId })
  const host = backupHost(organizationId)
  const snapshots = await resticSnapshots(base, { tags: [] })
  return snapshots
    .filter((s) => !s.tags.includes(PROBE_TAG) && !s.hostname.startsWith(`${PROBE_TAG}-`))
    .map((s) => ({
      id: s.id,
      shortId: s.shortId,
      time: s.time,
      bytes: s.summary ? s.summary.totalBytesProcessed : null,
      filesNew: s.summary ? s.summary.filesNew : null,
      dataAdded: s.summary ? s.summary.dataAdded : null,
      files: s.paths.length > 1,
      trigger: snapshotTrigger(s.tags),
      thisWorkshop: s.hostname === host || s.tags.includes(backupTag(organizationId)),
    }))
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
}

/**
 * Queue a restore of one snapshot. Throws BackupBusyError while a backup or
 * restore is queued or running for the target. `requestedBy` is the member
 * who asked; null for support acting from torqvoice.com, with its reason.
 */
export async function queueRestore(
  target: RunTarget | string,
  snapshotId: string,
  extra: { requestedBy?: string | null; reason?: string | null } = {}
): Promise<{ runId: string }> {
  if (!/^[0-9a-f]{8,64}$/.test(snapshotId)) throw new Error('Invalid snapshot id')
  return queueBackupRun(target, 'restore', { snapshotId, ...extra })
}

/**
 * What restic wrote out, found by walking the restore folder: restic keeps
 * every path as it was on the server that took the backup, and that server
 * may have kept its data somewhere else. `data.json` is the staged data
 * file; the uploads folder is a workshop's folder inside one called
 * `uploads`, this workshop's own when the snapshot holds several.
 */
export async function locateRestored(
  root: string,
  organizationId: string
): Promise<{ dataFile: string | null; filesDir: string | null }> {
  let dataFile: string | null = null
  const uploadDirs: string[] = []
  const walk = async (dir: string, depth: number) => {
    if (depth > MAX_DEPTH) return
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isFile()) {
        if (entry.name === 'data.json' && !dataFile) dataFile = full
        continue
      }
      if (!entry.isDirectory()) continue
      if (path.basename(dir) === 'uploads') {
        uploadDirs.push(full)
        continue
      }
      await walk(full, depth + 1)
    }
  }
  await walk(root, 0)
  uploadDirs.sort()
  const own = uploadDirs.find((d) => path.basename(d) === organizationId)
  return { dataFile, filesDir: own ?? uploadDirs[0] ?? null }
}

/**
 * Whose name the restore is written in: the member who asked, or, for a
 * restore support started, the workshop's owner, whose workshop it is.
 */
async function restoreActor(organizationId: string, requestedBy: string | null): Promise<string> {
  if (requestedBy) return requestedBy
  const owner = await db.organizationMember.findFirst({
    where: { organizationId, role: 'owner' },
    select: { userId: true },
    orderBy: { id: 'asc' },
  })
  if (!owner) throw new Error('The workshop has no owner to restore on behalf of')
  return owner.userId
}

/**
 * Run a queued restore. Returns the row; never throws for a failed restore.
 * While another run holds the lock the row stays queued and comes back as
 * it is, for the queue to start later. The audit row is written once the
 * workshop's rows (its old audit log among them) have been replaced.
 */
export async function runRestore(runId: string): Promise<BackupRunView> {
  const run = await db.backupRun.findUnique({ where: { id: runId } })
  if (!run) throw new Error('Backup run not found')
  if (run.status !== 'queued') return runView(run)
  if (run.trigger !== 'restore' || !run.snapshotId) {
    return finishRun(runId, { status: 'failed', error: 'This run is not a restore' })
  }
  if (!acquireBackupLock(runId)) return runView(run)

  const organizationId = run.organizationId
  const snapshotId = run.snapshotId
  let folder: string | null = null
  let safetySnapshotId: string | null = null
  let frozen = false
  let renewal: ReturnType<typeof setInterval> | null = null
  // Where the run got to, so a failure says what it means for the workshop.
  let phase: 'preparing' | 'safety' | 'restoring' = 'preparing'
  try {
    await db.backupRun.update({
      where: { id: runId },
      data: { status: 'running', startedAt: new Date() },
    })
    const userId = await restoreActor(organizationId, run.requestedBy)
    const target: OpenedTarget = await openTarget(
      run.kind === 'platform'
        ? { kind: 'platform', organizationId }
        : { kind: 'destination', connectionId: run.connectionId ?? '' }
    )
    if (target.organizationId !== organizationId) {
      throw new Error('The repository belongs to another workshop')
    }

    // From here on nothing in the workshop changes but through this restore.
    freezeOrganization(organizationId)
    frozen = true
    // Keep the freeze from lapsing under a restore that runs past its net.
    renewal = setInterval(() => renewFreeze(organizationId), FREEZE_RENEW_MS)
    renewal.unref?.()
    await closeRestorePoints(organizationId)

    // The way back: the workshop as it is right now, kept ninety days.
    phase = 'safety'
    const safety = await takeSafetySnapshot(organizationId, target)
    safetySnapshotId = safety.snapshotId
    await db.backupRun.update({ where: { id: runId }, data: { safetySnapshotId } })
    phase = 'restoring'

    folder = restoreDirFor(organizationId, runId)
    await rm(folder, { recursive: true, force: true })
    await mkdir(folder, { recursive: true, mode: 0o700 })
    const written = await resticRestore(target.base, { snapshotId, target: folder })

    const found = await locateRestored(folder, organizationId)
    if (!found.dataFile) throw new Error('The snapshot holds no data.json')
    const filesDir =
      found.filesDir &&
      (await stat(found.filesDir)
        .then((s) => s.isDirectory())
        .catch(() => false))
        ? found.filesDir
        : null

    const result = await restoreFromDisk(
      { organizationId, userId },
      { dataFile: found.dataFile, filesDir }
    )

    await target.log('info', 'Backup restored', {
      snapshot: snapshotId,
      safetySnapshot: safetySnapshotId,
      filesRestored: written.filesRestored,
      redactedSettings: result.redactedSettings,
    })
    const name = await repositoryName(target)
    await logAudit(
      { userId, organizationId },
      {
        action: 'integration.backup_restore',
        entity: 'BackupRun',
        entityId: runId,
        details: {
          key: 'backup_restored',
          params: { name, snapshot: snapshotId.slice(0, 8) },
        },
        metadata: {
          redactedSettings: result.redactedSettings,
          safetySnapshotId,
          bySupport: run.requestedBy === null,
          reason: run.reason,
        },
      }
    ).catch((err) => console.error('[restore] could not write the audit row:', err))
    await tellWorkshop(organizationId, {
      name,
      snapshotId,
      bySupport: run.requestedBy === null,
      reason: run.reason,
    }).catch((err) => console.error('[restore] could not tell the workshop:', err))

    return await finishRun(runId, {
      status: 'done',
      snapshotId,
      safetySnapshotId,
      filesNew: written.filesRestored,
      bytesAdded: BigInt(Math.round(written.bytesRestored)),
    })
  } catch (err) {
    const message = err instanceof ResticError ? connectMessage(err) : describe(err)
    console.error(`[restore] run ${runId} failed (${phase}):`, message)
    const error =
      phase === 'safety'
        ? `Could not take a safety copy of the workshop first; nothing was changed. ${message}`
        : phase === 'preparing'
          ? `${message} Nothing in the workshop was changed.`
          : message
    return await finishRun(runId, { status: 'failed', error, safetySnapshotId })
  } finally {
    if (renewal) clearInterval(renewal)
    if (frozen) unfreezeOrganization(organizationId)
    if (folder) {
      await rm(folder, { recursive: true, force: true }).catch((err) =>
        console.warn('[restore] could not remove the restore folder:', err)
      )
    }
    releaseBackupLock(runId)
    void drainBackupQueue().catch((err) => console.error('[restore] drain failed:', err))
  }
}

async function repositoryName(target: OpenedTarget): Promise<string> {
  if (target.kind === 'platform') {
    const t = await organizationTranslator(target.organizationId, 'integrations')
    return t('backupAlerts.platformName')
  }
  const connection = target.connectionId
    ? await db.integrationConnection.findUnique({
        where: { id: target.connectionId },
        select: { connectorId: true },
      })
    : null
  return (connection && getManifest(connection.connectorId)?.name) ?? 'backup destination'
}

/**
 * Every owner and administrator hears that the workshop was put back to a
 * point in time, who asked (a member, or support with its reason), and that
 * the safety copy can undo it.
 */
async function tellWorkshop(
  organizationId: string,
  input: { name: string; snapshotId: string; bySupport: boolean; reason: string | null }
): Promise<void> {
  const t = await organizationTranslator(organizationId, 'integrations')
  const when = new Intl.DateTimeFormat(t.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: await workshopTimeZone(organizationId),
  }).format(new Date())
  const intro = t('backupAlerts.restoredIntro', {
    name: input.name,
    snapshot: input.snapshotId.slice(0, 8),
    time: when,
  })
  const by = input.bySupport
    ? t('backupAlerts.restoredBySupport', { reason: input.reason || t('backupAlerts.noReason') })
    : t('backupAlerts.restoredByMember')
  const undo = t('backupAlerts.restoredUndo')
  await notify({
    organizationId,
    type: 'backup_restored',
    title: t('backupAlerts.restoredTitle'),
    message: `${intro} ${by}`,
    entityType: 'PlatformBackup',
    entityId: organizationId,
    entityUrl: '/settings/data',
  })
  await mailAdmins(
    organizationId,
    t('backupAlerts.restoredSubject'),
    `<p>${escapeHtml(intro)}</p><p>${escapeHtml(by)}</p><p>${escapeHtml(undo)}</p>`
  )
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
