'use server'

import { z } from 'zod'
import { gateFleetNumber, isFleetNumberEnabled } from '@/features/vehicles/Lib/fleetNumberSetting'
import {
  VEHICLE_BATCH_SIZE,
  vehicleCountOrderBy,
  vehicleListInclude,
  vehicleListSort,
  vehicleListWhere,
} from '@/features/vehicles/Lib/vehicleList.server'
import { db } from '@/lib/db'
import { type Cursor, cursorSchema, keysetAfter, keysetCursor, keysetOrderBy } from '@/lib/keyset'
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

/** How many rows the service-count sort has already shown, read off its cursor. */
function offsetOf(cursor: Cursor | null | undefined): number {
  if (!cursor) return 0
  const [offset] = cursor.v
  if (
    cursor.v.length !== 1 ||
    typeof offset !== 'number' ||
    !Number.isInteger(offset) ||
    offset < 0
  )
    throw new Error('Invalid cursor')
  return offset
}

/**
 * One batch of the vehicle list. The first (no cursor) also carries the
 * total, the archived count and whether any vehicle has an inspection date;
 * the rest carry rows only.
 */
export async function getVehicleRows(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ organizationId }) => {
      const params = inputSchema.parse(input)
      const where = await vehicleListWhere(organizationId, params)
      const sort = vehicleListSort(params)
      const first = !params.cursor

      // Sorted by service count the list pages by position: there is no
      // filter for "vehicles with fewer jobs than this one" (see the builder).
      const offset = sort ? 0 : offsetOf(params.cursor)
      const batchWhere =
        sort && params.cursor ? { AND: [where, keysetAfter(sort, params.cursor)] } : where

      const [found, total, archivedCount, inspectionDataCount, fleetNumberShown] =
        await Promise.all([
          db.vehicle.findMany({
            where: batchWhere,
            include: vehicleListInclude,
            orderBy: sort ? keysetOrderBy(sort) : vehicleCountOrderBy(params.sortOrder),
            ...(offset ? { skip: offset } : {}),
            // One more than a batch says whether there is anything after it.
            take: VEHICLE_BATCH_SIZE + 1,
          }),
          first ? db.vehicle.count({ where }) : null,
          first ? db.vehicle.count({ where: { organizationId, isArchived: true } }) : null,
          first
            ? db.vehicleInspectionStatus.count({ where: { organizationId, dueAt: { not: null } } })
            : null,
          isFleetNumberEnabled(organizationId),
        ])

      const rows = found.slice(0, VEHICLE_BATCH_SIZE)
      const last = rows[rows.length - 1]
      let nextCursor: Cursor | null = null
      if (found.length > VEHICLE_BATCH_SIZE && last) {
        nextCursor = sort
          ? keysetCursor(sort, last)
          : { v: [offset + VEHICLE_BATCH_SIZE], id: last.id }
      }

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
