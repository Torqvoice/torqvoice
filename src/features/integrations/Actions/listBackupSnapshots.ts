'use server'

import { BACKUP_CAPABILITY, canRestoreBackups } from '../Lib/backup'
import type { BackupSnapshotView } from '../Lib/backup-types'
import { connectorAllowed } from '../Lib/plan'
import { getManifest } from '@/integrations/registry'
import { listSnapshots } from '@/lib/backup/restore'
import { db } from '@/lib/db'
import { FeatureGatedError, getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

/**
 * Every backup at a destination, for the Backups card's full list. The same
 * right as the restore itself: the list says when the workshop was backed
 * up and how much it holds.
 */
export async function listBackupSnapshots(connectorId: string) {
  return withAuth(
    async ({ organizationId, userId, isAdmin }): Promise<BackupSnapshotView[]> => {
      if (!isAdmin) throw new Error('Only an owner or administrator can restore a backup')
      // On the cloud, where workshops share a database, the owner's alone.
      if (!(await canRestoreBackups({ userId, organizationId, isAdmin }))) {
        throw new Error('restoreOwnerOnly')
      }
      const manifest = getManifest(connectorId)
      if (!manifest?.capabilities.includes(BACKUP_CAPABILITY)) {
        throw new Error('This integration is not a backup destination')
      }
      if (!connectorAllowed(manifest, await getFeatures(organizationId))) {
        throw new FeatureGatedError(
          manifest.plan ?? 'integrations',
          `${manifest.name} is not included in your plan.`
        )
      }
      const row = await db.integrationConnection.findUnique({
        where: { organizationId_connectorId: { organizationId, connectorId } },
        select: { id: true, status: true },
      })
      if (!row || (row.status !== 'active' && row.status !== 'error')) {
        throw new Error('Connect the destination first')
      }
      return listSnapshots(row.id)
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
      allowDuringRestore: true,
    }
  )
}
