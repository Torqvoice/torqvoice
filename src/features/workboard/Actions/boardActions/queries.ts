"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getServiceRecordTechnician(serviceRecordId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const sr = await db.serviceRecord.findFirst({
        where: { id: serviceRecordId, vehicle: { organizationId } },
        select: {
          technicianId: true,
          technician: { select: { id: true, name: true } },
        },
      });
      if (!sr || !sr.technician) return null;
      return { technician: sr.technician };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_BOARD },
      ],
    },
  );
}
