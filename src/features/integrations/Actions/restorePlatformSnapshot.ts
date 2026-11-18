'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { canRestoreBackups } from '../Lib/backup'
import { isKnownPlatformSnapshot } from '../Lib/platform-backup'
import { BackupBusyError, drainBackupQueue } from '@/lib/backup/engine'
import { platformBackupAllowed, platformBackupConfig } from '@/lib/backup/platform'
import { queueRestore } from '@/lib/backup/restore'
import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { FeatureGatedError, getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { reauthInputSchema, verifyReauth } from '@/lib/reauth.server'
import { withAuth } from '@/lib/with-auth'

const restoreSchema = reauthInputSchema.extend({
  snapshotId: z.string().regex(/^[0-9a-f]{8,64}$/),
  /** The workshop's name, typed to confirm. */
  confirmName: z.string(),
})

export type RestorePlatformSnapshotInput = z.infer<typeof restoreSchema>

/**
 * Put the workshop back to one of its restore points. Owner only: the
 * restore replaces everything the workshop has, so the owner proves who they
 * are again (password, two-factor code or a fresh sign-in, see
 * lib/reauth.server.ts) and types the workshop's name, as for deleting the
 * workshop. The snapshot must be one of the stored restore points, so no id
 * from elsewhere is ever handed to restic. The run is queued; the card
 * follows it, and a safety copy is taken before anything is replaced.
 */
export async function restorePlatformSnapshot(input: RestorePlatformSnapshotInput) {
  return withAuth(
    async ({ organizationId, userId, isAdmin }): Promise<{ runId: string }> => {
      demoGuard()
      if (!platformBackupConfig()) throw new Error('Backups by Torqvoice are not available here')
      if (!isAdmin) throw new Error('restoreOwnerOnly')
      if (!(await canRestoreBackups({ userId, organizationId, isAdmin }))) {
        throw new Error('restoreOwnerOnly')
      }
      if (!platformBackupAllowed(await getFeatures(organizationId))) {
        throw new FeatureGatedError('platformBackups', 'Backups by Torqvoice are not in your plan.')
      }
      const { snapshotId, confirmName, password, totpCode } = restoreSchema.parse(input)
      const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      })
      if (!org || confirmName.trim() !== org.name.trim()) {
        throw new Error('Type the workshop name exactly as it is written to confirm')
      }
      await verifyReauth(userId, { password, totpCode }, 'restore')
      if (!(await isKnownPlatformSnapshot(organizationId, snapshotId))) {
        throw new Error('That restore point is not in the list any more; refresh and choose again')
      }
      let runId: string
      try {
        runId = (
          await queueRestore({ kind: 'platform', organizationId }, snapshotId, {
            requestedBy: userId,
          })
        ).runId
      } catch (err) {
        if (err instanceof BackupBusyError) throw new Error('restoreBusy')
        throw err
      }
      void drainBackupQueue().catch((err) => console.error('[restore] run failed:', err))
      revalidatePath('/settings/data')
      return { runId }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'integration.backup_restore',
        entity: 'BackupRun',
        entityId: result.runId,
        details: {
          key: 'backup_restore_started',
          params: { name: 'Backups by Torqvoice', snapshot: input.snapshotId.slice(0, 8) },
        },
      }),
    }
  )
}
