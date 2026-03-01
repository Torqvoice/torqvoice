import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function GET(request: Request) {
  return withDesktopAuth(
    request,
    async ({ organizationId, isAdmin }) => {
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

      return NextResponse.json({
        isAdmin,
        activeJobs,
        pendingJobs,
        todayRevenue: todayCompletedRecords._sum.totalAmount || 0,
        totalCustomers,
        todaysServices,
        recentServices,
      });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.DASHBOARD },
      ],
    },
  );
}
