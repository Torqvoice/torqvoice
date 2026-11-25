'use server'

import { z } from 'zod'
import {
  presentStockMovement,
  STOCK_MOVEMENT_BATCH_SIZE,
  stockMovementListSelect,
  stockMovementListSort,
  stockMovementListWhere,
} from '@/features/inventory/Lib/stockMovementList.server'
import { db } from '@/lib/db'
import { cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { workshopDateSettings } from '@/lib/workshop-timezone'

const inputSchema = z.object({
  inventoryPartId: z.string().min(1).max(100),
  reason: z.string().max(50).optional(),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/**
 * One batch of a part's stock history, the answer to "where was this used,
 * and when did the count change?". The first (no cursor) also carries the
 * total; the rest carry rows only.
 */
export async function getStockMovementRows(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ organizationId }) => {
      const params = inputSchema.parse(input)
      const where = stockMovementListWhere(organizationId, params)
      const sort = stockMovementListSort
      const first = !params.cursor
      const batchWhere = params.cursor ? { AND: [where, keysetAfter(sort, params.cursor)] } : where

      const [found, total, dates] = await Promise.all([
        db.stockMovement.findMany({
          where: batchWhere,
          select: stockMovementListSelect,
          orderBy: keysetOrderBy(sort),
          // One more than a batch says whether there is anything after it.
          take: STOCK_MOVEMENT_BATCH_SIZE + 1,
        }),
        first ? db.stockMovement.count({ where }) : null,
        workshopDateSettings(organizationId),
      ])

      const rows = found.slice(0, STOCK_MOVEMENT_BATCH_SIZE)
      const last = rows[rows.length - 1]
      const nextCursor =
        found.length > STOCK_MOVEMENT_BATCH_SIZE && last ? keysetCursor(sort, last) : null

      return {
        rows: rows.map((row) => presentStockMovement(row, dates)),
        nextCursor,
        total: total ?? undefined,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INVENTORY },
      ],
    }
  )
}
