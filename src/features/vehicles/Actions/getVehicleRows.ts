'use server'

import { z } from 'zod'
import { gateFleetNumber, isFleetNumberEnabled } from '@/features/vehicles/Lib/fleetNumberSetting'
import {
  VEHICLE_BATCH_SIZE,
  vehicleIdsByServiceCount,
  vehicleListInclude,
  vehicleListSort,
  vehicleListWhereWith,
  vehicleSearchOptions,
} from '@/features/vehicles/Lib/vehicleList.server'
import { db } from '@/lib/db'
import { type Cursor, cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
import { inIdOrder } from '@/lib/keyset-count'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = z.object({
  search: z.string().max(200).optional(),
  archived: z.boolean().optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  inspectionDue: z.union([z.literal('overdue'), z.literal(30), z.literal(90)]).optional(),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/**
 * One batch of the vehicle list. The first (no cursor) also carries the
 * total, the archived count and whether any vehicle has an inspection date;
 * the rest carry rows only.
 */
export async function getVehicleRows(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ organizationId }) => {
      const params = inputSchema.parse(input)
      // One reading of the settings and the clock for the Prisma where and,
      // on the service-count sort, its SQL twin.
      const options = await vehicleSearchOptions(organizationId, params)
      const now = new Date()
      const where = vehicleListWhereWith(organizationId, params, options, now)
      const sort = vehicleListSort(params)
      const first = !params.cursor

      const loadByIds = async (ids: string[]) =>
        ids.length
          ? db.vehicle.findMany({
              where: { organizationId, id: { in: ids } },
              include: vehicleListInclude,
            })
          : []

      /** One batch, and where the next one carries on. */
      const loadBatch = async (): Promise<{
        rows: Awaited<ReturnType<typeof loadByIds>>
        nextCursor: Cursor | null
      }> => {
        if (sort) {
          const batchWhere = params.cursor
            ? { AND: [where, keysetAfter(sort, params.cursor)] }
            : where
          const found = await db.vehicle.findMany({
            where: batchWhere,
            include: vehicleListInclude,
            orderBy: keysetOrderBy(sort),
            // One more than a batch says whether there is anything after it.
            take: VEHICLE_BATCH_SIZE + 1,
          })
          const rows = found.slice(0, VEHICLE_BATCH_SIZE)
          const last = rows[rows.length - 1]
          return {
            rows,
            nextCursor: found.length > VEHICLE_BATCH_SIZE && last ? keysetCursor(sort, last) : null,
          }
        }

        // By service count: one batch of ids, filtered, ordered and cut
        // after the cursor by Postgres, then loaded in that order.
        const ordered = await vehicleIdsByServiceCount(
          organizationId,
          params,
          options,
          now,
          params.cursor,
          VEHICLE_BATCH_SIZE + 1
        )
        const page = ordered.slice(0, VEHICLE_BATCH_SIZE)
        const ids = page.map((entry) => entry.id)
        const last = page[page.length - 1]
        return {
          rows: inIdOrder(ids, await loadByIds(ids)),
          nextCursor:
            ordered.length > VEHICLE_BATCH_SIZE && last ? { v: [last.count], id: last.id } : null,
        }
      }

      const [{ rows, nextCursor }, total, archivedCount, inspectionDataCount, fleetNumberShown] =
        await Promise.all([
          loadBatch(),
          first ? db.vehicle.count({ where }) : null,
          first ? db.vehicle.count({ where: { organizationId, isArchived: true } }) : null,
          first
            ? db.vehicleInspectionStatus.count({ where: { organizationId, dueAt: { not: null } } })
            : null,
          isFleetNumberEnabled(organizationId),
        ])

      return {
        rows: rows.map((vehicle) => gateFleetNumber(vehicle, fleetNumberShown)),
        nextCursor,
        total: total ?? undefined,
        archivedCount: archivedCount ?? undefined,
        /** Whether any vehicle here has an inspection date, which is when the filter is worth showing. */
        hasInspectionData: inspectionDataCount === null ? undefined : inspectionDataCount > 0,
      }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
