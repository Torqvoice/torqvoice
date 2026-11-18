'use server'

import type { PlatformBackupOverview } from '../Lib/backup-types'
import { platformBackupOverview } from '../Lib/platform-backup'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

/**
 * The Backups by Torqvoice card's data, for the card to refresh itself while
 * a run or a restore is in progress. Allowed during a restore: it is how the
 * page learns the restore is done.
 */
export async function getPlatformBackupStatus() {
  return withAuth(
    async ({ organizationId, userId, isAdmin }): Promise<PlatformBackupOverview | null> =>
      platformBackupOverview(organizationId, { userId, isAdmin }),
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
      allowDuringRestore: true,
    }
  )
}
