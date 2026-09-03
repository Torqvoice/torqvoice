'use server'

import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const DAY_MS = 86_400_000

export interface InspectionDueItem {
  vehicleId: string
  label: string
  licensePlate: string | null
  customerName: string | null
  dueAt: string
  source: string
}

export interface InspectionsDueSummary {
  overdue: number
  dueWithin30: number
  dueWithin90: number
  /** Soonest first, overdue included, capped for the card. */
  items: InspectionDueItem[]
}

/**
 * The dashboard's answer to "which of our cars are due for inspection".
 * Null when nothing in this organisation has an inspection date yet, so the
 * card never renders for a workshop without a registry connected.
 */
export async function getInspectionsDueSummary() {
  return withAuth(
    async ({ organizationId }): Promise<InspectionsDueSummary | null> => {
      const any = await db.vehicleInspectionStatus.findFirst({
        where: { organizationId, dueAt: { not: null } },
        select: { id: true },
      })
      if (!any) return null

      const now = new Date()
      const live = { organizationId, vehicle: { isArchived: false } }
      const [overdue, dueWithin30, dueWithin90, rows] = await Promise.all([
        db.vehicleInspectionStatus.count({ where: { ...live, dueAt: { lt: now } } }),
        db.vehicleInspectionStatus.count({
          where: { ...live, dueAt: { gte: now, lt: new Date(now.getTime() + 30 * DAY_MS) } },
        }),
        db.vehicleInspectionStatus.count({
          where: { ...live, dueAt: { gte: now, lt: new Date(now.getTime() + 90 * DAY_MS) } },
        }),
        db.vehicleInspectionStatus.findMany({
          where: { ...live, dueAt: { lt: new Date(now.getTime() + 90 * DAY_MS) } },
          orderBy: { dueAt: 'asc' },
          take: 8,
          select: {
            dueAt: true,
            source: true,
            vehicle: {
              select: {
                id: true,
                year: true,
                make: true,
                model: true,
                licensePlate: true,
                customer: { select: { name: true } },
              },
            },
          },
        }),
      ])

      return {
        overdue,
        dueWithin30,
        dueWithin90,
        items: rows.flatMap((r) =>
          r.dueAt
            ? [
                {
                  vehicleId: r.vehicle.id,
                  label: `${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}`,
                  licensePlate: r.vehicle.licensePlate,
                  customerName: r.vehicle.customer?.name ?? null,
                  dueAt: r.dueAt.toISOString(),
                  source: r.source,
                },
              ]
            : []
        ),
      }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
