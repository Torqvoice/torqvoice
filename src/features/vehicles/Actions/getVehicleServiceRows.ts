'use server'

import { z } from 'zod'
import {
  VEHICLE_SERVICE_BATCH_SIZE,
  vehicleServiceListInclude,
  vehicleServiceListSort,
  vehicleServiceListWhere,
} from '@/features/vehicles/Lib/vehicleServiceList.server'
import { db } from '@/lib/db'
import { cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  vehicleId: z.string().min(1).max(100),
  search: z.string().max(200).optional(),
  type: z.string().max(50).optional(),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/**
 * One batch of a vehicle's work orders, for the classic vehicle page. The
 * first (no cursor) also carries the total; the rest carry rows only.
 */
export async function getVehicleServiceRows(input: z.input<typeof inputSchema>) {
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

      const where = vehicleServiceListWhere(organizationId, params.vehicleId, params)
      const sort = vehicleServiceListSort()
      const first = !params.cursor
      const batchWhere = params.cursor ? { AND: [where, keysetAfter(sort, params.cursor)] } : where

      const [found, total] = await Promise.all([
        db.serviceRecord.findMany({
          where: batchWhere,
          include: vehicleServiceListInclude,
          orderBy: keysetOrderBy(sort),
          // One more than a batch says whether there is anything after it.
          take: VEHICLE_SERVICE_BATCH_SIZE + 1,
        }),
        first ? db.serviceRecord.count({ where }) : null,
      ])

      const rows = found.slice(0, VEHICLE_SERVICE_BATCH_SIZE)
      const last = rows[rows.length - 1]
      const nextCursor =
        found.length > VEHICLE_SERVICE_BATCH_SIZE && last ? keysetCursor(sort, last) : null

      return { rows, nextCursor, total: total ?? undefined }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}
