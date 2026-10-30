import path from 'node:path'
import type { ResticRepository } from '@/features/integrations/Lib/backup-types'
import type { ConnectorContext, ConnectorServer } from '@/features/integrations/Lib/types'
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
  jobs: {},
  backupTarget: { repository },
}
