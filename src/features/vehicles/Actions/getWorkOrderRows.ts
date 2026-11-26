'use server'

import { z } from 'zod'
import { gateCustomerReference } from '@/features/customer-reference/Lib/referenceSetting'
import {
  WORK_ORDER_BATCH_SIZE,
  workOrderListInclude,
  workOrderListSort,
  workOrderListWhere,
} from '@/features/vehicles/Lib/workOrderList.server'
import { db } from '@/lib/db'
import { cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.string().max(50).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  due: z.string().max(20).optional(),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/**
 * One batch of the work order list. The first (no cursor) also carries the
 * total and the status counts the tabs show; the rest carry rows only, since
 * counting the whole list again for every batch would buy nothing.
 */
export async function getWorkOrderRows(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ organizationId }) => {
      const params = inputSchema.parse(input)
      const { where, referenceOn } = await workOrderListWhere(organizationId, params)
      const sort = workOrderListSort(params.sortBy, params.sortOrder)
      const first = !params.cursor
      const batchWhere = params.cursor ? { AND: [where, keysetAfter(sort, params.cursor)] } : where

      const [found, total, statusCounts] = await Promise.all([
        db.serviceRecord.findMany({
          where: batchWhere,
          include: workOrderListInclude,
          orderBy: keysetOrderBy(sort),
          // One more than a batch says whether there is anything after it.
          take: WORK_ORDER_BATCH_SIZE + 1,
        }),
        first ? db.serviceRecord.count({ where }) : null,
        first
          ? db.serviceRecord.groupBy({ by: ['status'], where: { organizationId }, _count: true })
          : null,
      ])

      const rows = found.slice(0, WORK_ORDER_BATCH_SIZE)
      const last = rows[rows.length - 1]
      const nextCursor =
        found.length > WORK_ORDER_BATCH_SIZE && last ? keysetCursor(sort, last) : null

      let counts: Record<string, number> | undefined
      if (statusCounts) {
        counts = {}
        for (const g of statusCounts) counts[g.status] = g._count
      }

      return {
        rows: rows.map((record) => gateCustomerReference(record, referenceOn)),
        nextCursor,
        total: total ?? undefined,
        statusCounts: counts,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_ORDERS },
      ],
    }
  )
}
