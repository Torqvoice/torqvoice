'use server'

import { z } from 'zod'
import { EXPLORE_DATASETS, getRestorePointRow as get } from '@/lib/backup/explore'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  snapshotId: z.string().regex(/^[0-9a-f]{8,64}$/),
  dataset: z.enum(EXPLORE_DATASETS as [string, ...string[]]),
  id: z.string().min(1).max(64),
})
export type GetRestorePointRowInput = z.infer<typeof inputSchema>

/** One record inside an open restore point, with everything nested under it. */
export async function getRestorePointRow(input: GetRestorePointRowInput) {
  return withAuth(
    async ({ organizationId, isAdmin }) => {
      if (!isAdmin) throw new Error('restoreOwnerOnly')
      const { snapshotId, dataset, id } = inputSchema.parse(input)
      return get(organizationId, snapshotId, dataset as (typeof EXPLORE_DATASETS)[number], id)
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}
