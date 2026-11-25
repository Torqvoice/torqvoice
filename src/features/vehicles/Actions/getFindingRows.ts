'use server'

import { z } from 'zod'
import {
  FINDING_BATCH_SIZE,
  findingListInclude,
  findingListSort,
  findingListWhere,
} from '@/features/vehicles/Lib/findingList.server'
import { db } from '@/lib/db'
import { cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  vehicleId: z.string().min(1).max(100),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/**
 * One batch of a vehicle's observations. The first (no cursor) also carries
 * the total; the rest carry rows only.
 */
export async function getFindingRows(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ organizationId }) => {
      const params = inputSchema.parse(input)

      // Deleted or another workshop's vehicle: an empty list rather than an
      // error, since this runs during the re-render after a vehicle is deleted.
      const vehicle = await db.vehicle.findFirst({
        where: { id: params.vehicleId, organizationId },
        select: { id: true },
      })
      if (!vehicle) return { rows: [], nextCursor: null, total: 0 }

      const where = findingListWhere(organizationId, params.vehicleId)
      const sort = findingListSort()
      const first = !params.cursor
      const batchWhere = params.cursor ? { AND: [where, keysetAfter(sort, params.cursor)] } : where

      const [found, total] = await Promise.all([
        db.vehicleFinding.findMany({
          where: batchWhere,
          include: findingListInclude,
          orderBy: keysetOrderBy(sort),
          // One more than a batch says whether there is anything after it.
          take: FINDING_BATCH_SIZE + 1,
        }),
        first ? db.vehicleFinding.count({ where }) : null,
      ])

      const rows = found.slice(0, FINDING_BATCH_SIZE)
      const last = rows[rows.length - 1]
      const nextCursor = found.length > FINDING_BATCH_SIZE && last ? keysetCursor(sort, last) : null

      return { rows, nextCursor, total: total ?? undefined }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
