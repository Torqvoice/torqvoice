import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ResticRepository } from '@/features/integrations/Lib/backup-types'
import type {
  ConnectorContext,
  ConnectorServer,
  PreviewTestResult,
} from '@/features/integrations/Lib/types'
import { forgetRepositoryCache, testBackupTarget } from '@/lib/backup/target'
import { dataRoot } from '@/lib/upload-root'
import { manifest } from './manifest'

/** Where local repositories live: BACKUP_LOCAL_ROOT, or `backups` under the data directory. */
export function localBackupRoot(): string {
  return process.env.BACKUP_LOCAL_ROOT || path.join(dataRoot(), 'backups')
}

const FOLDER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

/**
 * One workshop's repository folder under the backup root. The Folder setting
 * names it; left empty it is the workshop's id (a cuid, so a safe segment).
 * A typed name is one plain segment, and the joined path must land strictly
 * inside the root, so no name reaches any other folder on the server.
 */
export function localRepositoryPath(organizationId: string, folder?: unknown): string {
  if (!/^[a-z0-9]+$/i.test(organizationId)) throw new Error('Unexpected organisation id')
  const name = typeof folder === 'string' && folder.trim() ? folder.trim() : organizationId
  if (name === '.' || name === '..' || !FOLDER_NAME.test(name)) {
    throw new Error('The folder name may only hold letters, digits, dots, dashes and underscores')
  }
  const root = path.resolve(localBackupRoot())
  const inside = root.endsWith(path.sep) ? root : root + path.sep
  const dir = path.join(localBackupRoot(), name)
  if (!path.resolve(dir).startsWith(inside)) {
    throw new Error('The folder must be inside the backup root')
  }
  return dir
}

async function repository(ctx: ConnectorContext): Promise<ResticRepository> {
  const { organizationId, settings } = ctx.connection
  return { repository: localRepositoryPath(organizationId, settings.folder), env: {} }
}

/**
 * Proves the folder can be made, written to and cleaned up, with one test
 * file that is removed again. The repository itself is left to Connect.
 */
export async function testFolder(
  organizationId: string,
  folder?: unknown
): Promise<PreviewTestResult> {
  const reason = (err: unknown) => (err instanceof Error ? err.message : String(err))
  let dir: string
  try {
    dir = localRepositoryPath(organizationId, folder)
    await mkdir(dir, { recursive: true })
  } catch (err) {
    return { ok: false, step: 'folder', reason: reason(err) }
  }
  const probe = path.join(dir, `.torqvoice-test-${randomUUID()}`)
  try {
    await writeFile(probe, 'torqvoice')
  } catch (err) {
    return { ok: false, step: 'write', reason: reason(err) }
  }
  try {
    await rm(probe)
  } catch (err) {
    return { ok: false, step: 'delete', reason: reason(err) }
  }
  return { ok: true }
}

export const connector: ConnectorServer = {
  manifest,
  async identify(ctx) {
    const p = localRepositoryPath(ctx.connection.organizationId, ctx.connection.settings.folder)
    return { id: p, name: p }
  },
  async test(ctx) {
    return testBackupTarget(ctx, repository)
  },
  async onDisconnect(ctx) {
    // The repository itself stays: a disconnect is not a request to delete
    // every backup the workshop has.
    await forgetRepositoryCache(ctx.connection.organizationId)
  },
  previewTest: ({ organizationId, settings }) => testFolder(organizationId, settings.folder),
  jobs: {},
  backupTarget: { repository },
}
