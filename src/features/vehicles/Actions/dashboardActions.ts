'use server'

import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'

export async function getDashboardStats() {
  return withAuth(
    async ({ organizationId, role }) => {
      const isAdmin = role === 'owner' || role === 'admin' || role === 'super_admin'

      // Org-wide fallback reorder point; 0 disables it.
      const thresholdRow = await db.appSetting.findFirst({
        where: { organizationId, key: SETTING_KEYS.LOW_STOCK_DEFAULT_THRESHOLD },
        select: { value: true },
      })
      const parsedDefault = Number(thresholdRow?.value)
      const lowStockDefault =
        Number.isFinite(parsedDefault) && parsedDefault > 0 ? parsedDefault : 0

      const [
        activeJobs,
        pendingJobs,
        totalParts,
        lowStockRows,
        totalCustomers,
        todaysServices,
        recentServices,
      ] = await Promise.all([
        db.serviceRecord.count({
          where: { organizationId, status: { not: 'completed' } },
        }),
        db.serviceRecord.count({
          where: { organizationId, status: 'pending' },
        }),
        db.inventoryPart.count({
          where: { organizationId, isArchived: false },
        }),
        // Parts at or below their reorder point. Needs raw SQL because Prisma
        // cannot compare two columns of the same row in a `where` clause.
        // Mirrors isLow() in features/inventory/Lib/lowStockAlerts: a part's own
        // minQuantity wins, falling back to the org-wide default when unset.
        db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count
        FROM "inventory_parts" p
        WHERE p."organizationId" = ${organizationId}
          AND p."isArchived" = false
          AND COALESCE(NULLIF(p."minQuantity", 0), ${lowStockDefault}) > 0
          AND p."quantity" <= COALESCE(NULLIF(p."minQuantity", 0), ${lowStockDefault})
      `,
        db.customer.count({ where: { organizationId } }),
        db.serviceRecord.findMany({
          where: {
            organizationId,
            status: { in: ['pending', 'in-progress', 'waiting-parts'] },
          },
          include: {
            customer: { select: { id: true, name: true } },
            vehicle: {
              select: {
                id: true,
                make: true,
                model: true,
                year: true,
                licensePlate: true,
                customer: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: [{ startDateTime: { sort: 'desc', nulls: 'last' } }, { serviceDate: 'desc' }],
          take: 50,
        }),
        db.serviceRecord.findMany({
          where: {
            organizationId,
            status: 'completed',
          },
          include: {
            customer: { select: { id: true, name: true } },
            vehicle: {
              select: {
                id: true,
                make: true,
                model: true,
                year: true,
                licensePlate: true,
                customer: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: [{ startDateTime: { sort: 'desc', nulls: 'last' } }, { serviceDate: 'desc' }],
          take: 10,
        }),
      ])

      return {
        isAdmin,
        activeJobs,
        pendingJobs,
        totalParts,
        lowStockParts: Number(lowStockRows[0]?.count ?? 0),
        totalCustomers,
        todaysServices,
        recentServices,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.DASHBOARD },
      ],
    }
  )
}

export async function getUpcomingReminders() {
  return withAuth(
    async ({ organizationId }) => {
      return db.reminder.findMany({
        where: {
          isCompleted: false,
          organizationId,
        },
        include: {
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              licensePlate: true,
            },
          },
          customer: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
      })
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.DASHBOARD },
      ],
    }
  )
}
