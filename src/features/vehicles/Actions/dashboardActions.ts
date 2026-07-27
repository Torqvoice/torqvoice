"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getDashboardStats() {
  return withAuth(async ({ organizationId, role }) => {
    const isAdmin = role === "owner" || role === "admin" || role === "super_admin";

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
        where: { vehicle: { organizationId }, status: { not: "completed" } },
      }),
      db.serviceRecord.count({
        where: { vehicle: { organizationId }, status: "pending" },
      }),
      db.inventoryPart.count({
        where: { organizationId, isArchived: false },
      }),
      // Parts at or below their reorder point. Needs raw SQL because Prisma
      // cannot compare two columns of the same row in a `where` clause.
      db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count
        FROM "inventory_parts"
        WHERE "organizationId" = ${organizationId}
          AND "isArchived" = false
          AND "minQuantity" > 0
          AND "quantity" <= "minQuantity"
      `,
      db.customer.count({ where: { organizationId } }),
      db.serviceRecord.findMany({
        where: {
          vehicle: { organizationId },
          status: { in: ["pending", "in-progress", "waiting-parts"] },
        },
        include: {
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
        orderBy: [{ startDateTime: { sort: "desc", nulls: "last" } }, { serviceDate: "desc" }],
        take: 50,
      }),
      db.serviceRecord.findMany({
        where: {
          vehicle: { organizationId },
          status: "completed",
        },
        include: {
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
        orderBy: [{ startDateTime: { sort: "desc", nulls: "last" } }, { serviceDate: "desc" }],
        take: 10,
      }),
    ]);

    return {
      isAdmin,
      activeJobs,
      pendingJobs,
      totalParts,
      lowStockParts: Number(lowStockRows[0]?.count ?? 0),
      totalCustomers,
      todaysServices,
      recentServices,
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.DASHBOARD }] });
}

export async function getUpcomingReminders() {
  return withAuth(async ({ organizationId }) => {
    return db.reminder.findMany({
      where: {
        isCompleted: false,
        vehicle: { organizationId },
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
      },
      orderBy: { dueDate: "asc" },
      take: 10,
    });
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.DASHBOARD }] });
}
