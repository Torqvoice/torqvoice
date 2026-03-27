"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getStatusReportsForService(serviceRecordId: string) {
  return withAuth(
    async ({ organizationId }) => {
      // Validate the service record belongs to this org
      const serviceRecord = await db.serviceRecord.findFirst({
        where: { id: serviceRecordId, vehicle: { organizationId } },
        select: { id: true },
      });
      if (!serviceRecord) throw new Error("Service record not found");

      const reports = await db.statusReport.findMany({
        where: { serviceRecordId, organizationId },
        select: {
          id: true,
          title: true,
          status: true,
          videoUrl: true,
          createdAt: true,
          publicToken: true,
          expiresAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      return reports;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SERVICES },
      ],
    }
  );
}
