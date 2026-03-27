"use server";

import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createStatusReportSchema } from "../Schema/statusReportSchema";

export async function createStatusReport(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const data = createStatusReportSchema.parse(input);

      // Verify the service record belongs to this org
      const serviceRecord = await db.serviceRecord.findFirst({
        where: { id: data.serviceRecordId, vehicle: { organizationId } },
        select: { id: true, technicianId: true },
      });
      if (!serviceRecord) throw new Error("Service record not found");

      // Find technician linked to current user
      const technician = await db.technician.findFirst({
        where: { organizationId, userId, isActive: true },
        select: { id: true },
      });

      const report = await db.statusReport.create({
        data: {
          publicToken: randomBytes(32).toString("hex"),
          title: data.title,
          message: data.message,
          videoUrl: data.videoUrl,
          videoFileName: data.videoFileName,
          serviceRecordId: data.serviceRecordId,
          organizationId,
          technicianId: technician?.id || serviceRecord.technicianId,
          status: data.videoUrl ? "published" : "draft",
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });

      return report;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: "statusReport.create",
        entity: "StatusReport",
        entityId: result.id,
        message: `Created status report for service ${result.serviceRecordId}`,
      }),
    }
  );
}
