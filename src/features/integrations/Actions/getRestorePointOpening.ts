'use server'

import { z } from 'zod'
import type { ExploreStage } from '@/features/integrations/Lib/backup-types'
import { openingStage } from '@/lib/backup/explore'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  snapshotId: z.string().regex(/^[0-9a-f]{8,64}$/),
})
export type GetRestorePointOpeningInput = z.infer<typeof inputSchema>

/**
 * How far the open of one of this workshop's restore points has got, for the
 * page to show while it waits: null once it is open or when none is in flight.
 */
export async function getRestorePointOpening(input: GetRestorePointOpeningInput) {
  return withAuth(
    async ({ organizationId, isAdmin }): Promise<{ stage: ExploreStage | null }> => {
      if (!isAdmin) throw new Error('restoreOwnerOnly')
      const { snapshotId } = inputSchema.parse(input)
      return { stage: openingStage(organizationId, snapshotId) }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
      allowDuringRestore: true,
    }
  )
}
