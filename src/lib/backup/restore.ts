import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { backupHost, backupTag, runView } from '@/features/integrations/Lib/backup'
import type { BackupRunView, BackupSnapshotView } from '@/features/integrations/Lib/backup-types'
import { loadConnection } from '@/features/integrations/Lib/connections'
import { getManifest } from '@/integrations/registry'
import { logAudit } from '@/lib/audit'
import { db } from '@/lib/db'
import { dataRoot } from '@/lib/upload-root'
import { acquireBackupLock, finishRun, queueBackupRun, releaseBackupLock } from './engine'
import { restoreFromDisk } from './import'
import { ResticError, resticRestore, resticSnapshots } from './restic'
import { connectMessage, ensureCacheDir, repositoryPassword, sanitizeRepository } from './target'

/**
 * Putting a snapshot from a backup destination back into the workshop.
 *
 * `listSnapshots` is what the Restore section shows. `queueRestore` makes
 * the run row, with the same refusals as a backup, and `runRestore` does the
 * work: restic writes the snapshot to a temporary folder under the data
 * root, the restored `data.json` and uploads folder go through the same
 * import the uploaded zip uses, and the folder is removed whichever way it
 * ends. The server-wide lock is the backup's, so a backup never reads rows
 * a restore is replacing.
 */

/** How deep under the restore folder the backup's paths are looked for. */
const MAX_DEPTH = 16

/** Where one restore is written out: a folder of its own under the data root. */
export function restoreDirFor(organizationId: string, runId: string): string {
  if (!/^[a-z0-9]+$/i.test(organizationId) || !/^[a-z0-9]+$/i.test(runId)) {
    throw new Error('Unexpected id')
  }
  return path.join(dataRoot(), 'restore-tmp', `${organizationId}-${runId}`)
}

async function openTarget(connectionId: string) {
  const { ctx, server } = await loadConnection(connectionId)
  if (!server.backupTarget) throw new Error('This integration is not a backup destination')
  const organizationId = ctx.connection.organizationId
  const repo = sanitizeRepository(await server.backupTarget.repository(ctx))
  const password = repositoryPassword(ctx)
  const cacheDir = await ensureCacheDir(organizationId)
  return { ctx, organizationId, base: { repository: repo, password, cacheDir } }
}

function snapshotTrigger(tags: string[]): BackupSnapshotView['trigger'] {
  if (tags.includes('scheduled')) return 'scheduled'
  if (tags.includes('manual')) return 'manual'
  return null
}

/** The tiny snapshot a connection check writes and forgets again. */
const PROBE_TAG = 'torqvoice-probe'

/**
 * The snapshots at this destination, newest first. A repository holds one
 * workshop's backups, but not always under this workshop's id: a workshop
 * set up again on a new server connects the same storage with the same
 * password, and what the old install wrote is what it wants back. So every
 * snapshot is listed, with the ones this workshop took marked as such. The
 * engine backs up the staged data file and, when chosen, the uploads
 * folder, so a snapshot with two paths is one that carries photos and files.
 */
export async function listSnapshots(connectionId: string): Promise<BackupSnapshotView[]> {
  const { organizationId, base } = await openTarget(connectionId)
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
 * restore is queued or running for the connection.
 */
export async function queueRestore(
  connectionId: string,
  snapshotId: string
): Promise<{ runId: string }> {
  if (!/^[0-9a-f]{8,64}$/.test(snapshotId)) throw new Error('Invalid snapshot id')
  return queueBackupRun(connectionId, 'restore', { snapshotId })
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
 * Run a queued restore. Returns the finished row; never throws for a
 * failed restore. `actor` is the person who asked, for the audit row the
 * restore writes once the workshop's rows (its old audit log among them)
 * have been replaced.
 */
export async function runRestore(runId: string, actor: { userId: string }): Promise<BackupRunView> {
  const run = await db.backupRun.findUnique({ where: { id: runId } })
  if (!run) throw new Error('Backup run not found')
  if (run.status !== 'queued') return runView(run)
  if (run.trigger !== 'restore' || !run.snapshotId) {
    return finishRun(runId, { status: 'failed', error: 'This run is not a restore' })
  }

  if (!acquireBackupLock(runId)) {
    return finishRun(runId, {
      status: 'failed',
      error: 'A backup is running on this server; try again when it is done',
    })
  }

  const organizationId = run.organizationId
  let target: string | null = null
  try {
    await db.backupRun.update({
      where: { id: runId },
      data: { status: 'running', startedAt: new Date() },
    })
    const { ctx, base } = await openTarget(run.connectionId)
    if (ctx.connection.organizationId !== organizationId) {
      throw new Error('The destination belongs to another workshop')
    }

    target = restoreDirFor(organizationId, runId)
    await rm(target, { recursive: true, force: true })
    await mkdir(target, { recursive: true, mode: 0o700 })
    const written = await resticRestore(base, { snapshotId: run.snapshotId, target })

    const found = await locateRestored(target, organizationId)
    if (!found.dataFile) throw new Error('The snapshot holds no data.json')
    const filesDir =
      found.filesDir &&
      (await stat(found.filesDir)
        .then((s) => s.isDirectory())
        .catch(() => false))
        ? found.filesDir
        : null

    const result = await restoreFromDisk(
      { organizationId, userId: actor.userId },
      {
        dataFile: found.dataFile,
        filesDir,
      }
    )

    await ctx.log('info', 'Backup restored', {
      snapshot: run.snapshotId,
      filesRestored: written.filesRestored,
      redactedSettings: result.redactedSettings,
    })
    const manifest = getManifest(ctx.connection.connectorId)
    await logAudit(
      { userId: actor.userId, organizationId },
      {
        action: 'integration.backup_restore',
        entity: 'BackupRun',
        entityId: runId,
        details: {
          key: 'backup_restored',
          params: {
            name: manifest?.name ?? ctx.connection.connectorId,
            snapshot: run.snapshotId.slice(0, 8),
          },
        },
        metadata: { redactedSettings: result.redactedSettings },
      }
    ).catch((err) => console.error('[restore] could not write the audit row:', err))

    return await finishRun(runId, {
      status: 'done',
      snapshotId: run.snapshotId,
      filesNew: written.filesRestored,
      bytesAdded: BigInt(Math.round(written.bytesRestored)),
    })
  } catch (err) {
    const message = err instanceof ResticError ? connectMessage(err) : describe(err)
    console.error(`[restore] run ${runId} failed:`, message)
    return await finishRun(runId, { status: 'failed', error: message })
  } finally {
    if (target) {
      await rm(target, { recursive: true, force: true }).catch((err) =>
        console.warn('[restore] could not remove the restore folder:', err)
      )
    }
    releaseBackupLock(runId)
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
