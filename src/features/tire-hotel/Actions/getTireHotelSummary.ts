'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { warehouseCapacity } from '../Lib/capacity'
import { isTireHotelEnabled } from '../Lib/tireHotelSettings'

export type TireHotelSummary = {
  capacity: number
  used: number
  free: number
  storedSets: number
  needsPrep: number
}

/**
 * The dashboard's answer to "how is the tire hotel doing".
 *
 * Three numbers a shop acts on: whether there is room to say yes to another
 * customer, how much work is queued for the tire department, and what has
 * been earned but not yet invoiced. Returns null when the module is off, so
 * the card never renders for a shop that does not store tires.
 */
export async function getTireHotelSummary() {
  return withAuth(
    async ({ organizationId }) => {
      if (!(await isTireHotelEnabled(organizationId))) return null

      const [warehouses, storedSets, needsPrep] = await Promise.all([
        db.tireWarehouse.findMany({
          where: { organizationId, isArchived: false },
          select: {
            id: true,
            name: true,
            locations: {
              where: { isArchived: false },
              select: {
                id: true,
                code: true,
                capacity: true,
                tireSets: { where: { status: 'stored' }, select: { quantity: true } },
              },
            },
          },
        }),
        db.tireSet.count({ where: { organizationId, status: 'stored' } }),
        db.tireSet.count({
          // A written-off set can still carry a wash nobody ticked off. It is
          // in a skip, so it is not work anybody is going to do.
          where: {
            organizationId,
            status: { not: 'disposed' },
            treatments: { some: { status: 'pending' } },
          },
        }),
      ])

      const totals = warehouses.map(warehouseCapacity).reduce(
        (acc, w) => ({
          capacity: acc.capacity + w.capacity,
          used: acc.used + w.used,
        }),
        { capacity: 0, used: 0 }
      )

      return {
        capacity: totals.capacity,
        used: totals.used,
        free: Math.max(0, totals.capacity - totals.used),
        storedSets,
        needsPrep,
      } satisfies TireHotelSummary
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.TIRE_HOTEL },
      ],
    }
  )
}
