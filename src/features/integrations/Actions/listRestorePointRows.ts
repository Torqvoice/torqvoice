'use server'

import { z } from 'zod'
import { EXPLORE_DATASETS, listRestorePointRows as list } from '@/lib/backup/explore'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  snapshotId: z.string().regex(/^[0-9a-f]{8,64}$/),
  dataset: z.enum(EXPLORE_DATASETS as [string, ...string[]]),
  query: z.string().max(100).default(''),
  page: z.number().int().min(1).max(10_000).default(1),
})
export type ListRestorePointRowsInput = z.infer<typeof inputSchema>

/**
 * A page of one dataset inside an open restore point. Throws
 * `restorePointClosed` when it has to be opened (again) first.
 */
export async function listRestorePointRows(input: ListRestorePointRowsInput) {
  return withAuth(
    async ({ organizationId, isAdmin }) => {
      if (!isAdmin) throw new Error('restoreOwnerOnly')
      const { snapshotId, dataset, query, page } = inputSchema.parse(input)
      return list(
        organizationId,
        snapshotId,
        dataset as (typeof EXPLORE_DATASETS)[number],
        query,
        page
      )
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}
