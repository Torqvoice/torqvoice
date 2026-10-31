'use server'

import { z } from 'zod'
import { exploreSourceSchema, resolveExploreTarget } from '../Lib/explore-source'
import { openRestorePoint as open, type RestorePointSummary } from '@/lib/backup/explore'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  source: exploreSourceSchema,
  snapshotId: z.string().regex(/^[0-9a-f]{8,64}$/),
})
export type OpenRestorePointInput = z.infer<typeof inputSchema>

/**
 * Open a restore point for browsing: its data file is pulled out of the
 * workshop's repository and kept parsed for a quarter of an hour. Owners and
 * administrators only: what is inside is everything the workshop had.
 */
export async function openRestorePoint(input: OpenRestorePointInput) {
  return withAuth(
    async ({ organizationId, isAdmin }): Promise<RestorePointSummary> => {
      if (!isAdmin) throw new Error('restoreOwnerOnly')
      const { source, snapshotId } = inputSchema.parse(input)
      const target = await resolveExploreTarget(organizationId, source)
      return open(target, snapshotId)
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}
