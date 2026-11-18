'use server'

import { revalidatePath } from 'next/cache'
import { BackupBusyError, drainBackupQueue, queueBackupRun } from '@/lib/backup/engine'
import { platformBackupAllowed, platformBackupConfig } from '@/lib/backup/platform'
import { demoGuard } from '@/lib/demo'
import { FeatureGatedError, getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

/**
 * Take a backup into the platform repository now. The run is queued and the
 * card follows it; refused while one is queued or running for the workshop,
 * on a plan without platform backups, and on a server without them.
 */
export async function runPlatformBackupNow() {
  return withAuth(
    async ({ organizationId, userId }): Promise<{ runId: string }> => {
      demoGuard()
      if (!platformBackupConfig()) throw new Error('Backups by Torqvoice are not available here')
      if (!platformBackupAllowed(await getFeatures(organizationId))) {
        throw new FeatureGatedError('platformBackups', 'Backups by Torqvoice are not in your plan.')
      }
      let runId: string
      try {
        runId = (
          await queueBackupRun({ kind: 'platform', organizationId }, 'manual', {
            requestedBy: userId,
          })
        ).runId
      } catch (err) {
        if (err instanceof BackupBusyError) throw new Error('backupRunning')
        throw err
      }
      // Not awaited: the row is what the card watches. Behind another run it
      // waits its turn in the queue.
      void drainBackupQueue().catch((err) => console.error('[backup] manual run failed:', err))
      revalidatePath('/settings/data')
      return { runId }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'integration.backup_run',
        entity: 'BackupRun',
        entityId: result.runId,
        details: {
          key: 'backup_run_started',
          params: { name: 'Backups by Torqvoice', connectorId: 'platform' },
        },
      }),
    }
  )
}
