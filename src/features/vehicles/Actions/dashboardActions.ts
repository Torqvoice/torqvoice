"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getDashboardStats() {
  return withAuth(async ({ organizationId, role }) => {
    const isAdmin = role === "owner" || role === "admin" || role === "super_admin";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      activeJobs,
      pendingJobs,
      todayCompletedRecords,
      totalCustomers,
      todaysServices,
      recentServices,
    ] = await Promise.all([
      db.serviceRecord.count({
        where: { vehicle: { organizationId }, status: "in-progress" },
      }),
      db.serviceRecord.count({
        where: { vehicle: { organizationId }, status: "pending" },
      }),
      db.serviceRecord.aggregate({
        where: {
          vehicle: { organizationId },
          status: "completed",
          serviceDate: { gte: today, lt: tomorrow },
        },
        _sum: { totalAmount: true },
      }),
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
        orderBy: { serviceDate: "desc" },
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
        orderBy: { serviceDate: "desc" },
        take: 10,
      }),
    ]);

    return {
      isAdmin,
      activeJobs,
      pendingJobs,
      todayRevenue: todayCompletedRecords._sum.totalAmount || 0,
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
