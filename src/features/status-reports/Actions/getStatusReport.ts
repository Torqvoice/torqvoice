"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getStatusReport(statusReportId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const report = await db.statusReport.findFirst({
        where: { id: statusReportId, organizationId },
        include: {
          serviceRecord: {
            include: {
              vehicle: {
                select: {
                  make: true,
                  model: true,
                  year: true,
                  licensePlate: true,
                  customer: {
                    select: {
                      name: true,
                      email: true,
                      phone: true,
                      telegramChatId: true,
                    },
                  },
                },
              },
            },
          },
          technician: {
            select: { name: true },
          },
        },
      });

      if (!report) throw new Error("Status report not found");

      return report;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SERVICES },
      ],
    }
  );
}
