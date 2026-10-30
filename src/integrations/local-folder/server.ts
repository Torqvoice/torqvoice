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

/** One workshop's repository folder. The id is a cuid, so it is a safe path segment. */
export function localRepositoryPath(organizationId: string): string {
  if (!/^[a-z0-9]+$/i.test(organizationId)) throw new Error('Unexpected organisation id')
  return path.join(localBackupRoot(), organizationId)
}

async function repository(ctx: ConnectorContext): Promise<ResticRepository> {
  return { repository: localRepositoryPath(ctx.connection.organizationId), env: {} }
}

/**
 * Proves the folder can be made, written to and cleaned up, with one test
 * file that is removed again. The repository itself is left to Connect.
 */
export async function testFolder(organizationId: string): Promise<PreviewTestResult> {
  const reason = (err: unknown) => (err instanceof Error ? err.message : String(err))
  let dir: string
  try {
    dir = localRepositoryPath(organizationId)
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
    const p = localRepositoryPath(ctx.connection.organizationId)
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
  previewTest: ({ organizationId }) => testFolder(organizationId),
  jobs: {},
  backupTarget: { repository },
}
