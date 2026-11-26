'use server'

import { z } from 'zod'
import {
  INVENTORY_BATCH_SIZE,
  inventoryListInclude,
  inventoryListSort,
  inventoryListWhere,
} from '@/features/inventory/Lib/inventoryList.server'
import { db } from '@/lib/db'
import { cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  search: z.string().max(200).optional(),
  category: z.string().max(200).optional(),
  tag: z.string().max(200).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  lowStock: z.boolean().optional(),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/**
 * One batch of the inventory list. The first (no cursor) also carries the
 * total; the rest carry rows only.
 */
export async function getInventoryRows(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ organizationId }) => {
      const params = inputSchema.parse(input)
      const where = await inventoryListWhere(organizationId, params)
      const sort = inventoryListSort(params.sortBy, params.sortOrder)
      const first = !params.cursor
      const batchWhere = params.cursor ? { AND: [where, keysetAfter(sort, params.cursor)] } : where

      const [found, total] = await Promise.all([
        db.inventoryPart.findMany({
          where: batchWhere,
          include: inventoryListInclude,
          orderBy: keysetOrderBy(sort),
          // One more than a batch says whether there is anything after it.
          take: INVENTORY_BATCH_SIZE + 1,
        }),
        first ? db.inventoryPart.count({ where }) : null,
      ])

      const rows = found.slice(0, INVENTORY_BATCH_SIZE)
      const last = rows[rows.length - 1]
      const nextCursor =
        found.length > INVENTORY_BATCH_SIZE && last ? keysetCursor(sort, last) : null

      return { rows, nextCursor, total: total ?? undefined }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INVENTORY },
      ],
    }
  )
}
