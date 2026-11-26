'use server'

import { z } from 'zod'
import {
  INSPECTION_BATCH_SIZE,
  inspectionListInclude,
  inspectionListSort,
  inspectionListWhere,
} from '@/features/inspections/Lib/inspectionList.server'
import { db } from '@/lib/db'
import { cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.string().max(50).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/**
 * One batch of the inspection list. The first (no cursor) also carries the
 * total and the status counts the tabs show; the rest carry rows only.
 */
export async function getInspectionRows(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ organizationId }) => {
      const params = inputSchema.parse(input)
      const where = await inspectionListWhere(organizationId, params)
      const sort = inspectionListSort(params.sortBy, params.sortOrder)
      const first = !params.cursor
      const batchWhere = params.cursor ? { AND: [where, keysetAfter(sort, params.cursor)] } : where

      const [found, total, statusCounts] = await Promise.all([
        db.inspection.findMany({
          where: batchWhere,
          include: inspectionListInclude,
          orderBy: keysetOrderBy(sort),
          // One more than a batch says whether there is anything after it.
          take: INSPECTION_BATCH_SIZE + 1,
        }),
        first ? db.inspection.count({ where }) : null,
        first
          ? db.inspection.groupBy({ by: ['status'], where: { organizationId }, _count: true })
          : null,
      ])

      const rows = found.slice(0, INSPECTION_BATCH_SIZE)
      const last = rows[rows.length - 1]
      const nextCursor =
        found.length > INSPECTION_BATCH_SIZE && last ? keysetCursor(sort, last) : null

      let counts: Record<string, number> | undefined
      if (statusCounts) {
        counts = {}
        for (const g of statusCounts) counts[g.status] = g._count
      }

      return { rows, nextCursor, total: total ?? undefined, statusCounts: counts }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS },
      ],
    }
  )
}
