'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { BACKUP_CAPABILITY, canRestoreBackups } from '../Lib/backup'
import { connectorAllowed } from '../Lib/plan'
import { getManifest } from '@/integrations/registry'
import { BackupBusyError } from '@/lib/backup/engine'
import { queueRestore, runRestore } from '@/lib/backup/restore'
import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { FeatureGatedError, getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const restoreSchema = z.object({
  connectorId: z.string().min(1),
  snapshotId: z.string().regex(/^[0-9a-f]{8,64}$/),
  /** The workshop's name, typed to confirm. */
  confirmName: z.string(),
})

export type RestoreBackupSnapshotInput = z.infer<typeof restoreSchema>

/**
 * Put one snapshot from a backup destination back into the workshop. The
 * run goes on in the background and the page follows it; refused while a
 * backup or restore is queued or running, and refused to anyone but an
 * owner or administrator, since it replaces everything the workshop has.
 */
export async function restoreBackupSnapshot(input: RestoreBackupSnapshotInput) {
  return withAuth(
    async ({ organizationId, userId, isAdmin, role }): Promise<{ runId: string }> => {
      demoGuard()
      if (!isAdmin) throw new Error('Only an owner or administrator can restore a backup')
      // On the cloud, where workshops share a database, the owner's alone.
      if (!canRestoreBackups(role)) throw new Error('restoreOwnerOnly')
      const { connectorId, snapshotId, confirmName } = restoreSchema.parse(input)
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
      const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      })
      if (!org || confirmName.trim() !== org.name.trim()) {
        throw new Error('Type the workshop name exactly as it is written to confirm')
      }
      const row = await db.integrationConnection.findUnique({
        where: { organizationId_connectorId: { organizationId, connectorId } },
        select: { id: true, status: true },
      })
      if (!row || (row.status !== 'active' && row.status !== 'error')) {
        throw new Error('Connect the destination first')
      }
      let runId: string
      try {
        runId = (await queueRestore(row.id, snapshotId)).runId
      } catch (err) {
        if (err instanceof BackupBusyError) {
          throw new Error('A backup or restore is already running.')
        }
        throw err
      }
      // Not awaited: a restore with years of photos takes minutes. The row
      // is what the page watches; a failure is recorded on it.
      void runRestore(runId, { userId }).catch((err) => console.error('[restore] run failed:', err))
      revalidatePath(`/settings/integrations/${connectorId}`)
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
          params: {
            name: getManifest(input.connectorId)?.name ?? input.connectorId,
            snapshot: String(input.snapshotId).slice(0, 8),
          },
        },
      }),
    }
  )
}
