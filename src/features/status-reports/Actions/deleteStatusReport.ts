"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { unlink } from "fs/promises";
import path from "path";

export async function deleteStatusReport(statusReportId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const report = await db.statusReport.findFirst({
        where: { id: statusReportId, organizationId },
        select: { id: true, videoUrl: true, organizationId: true },
      });

      if (!report) throw new Error("Status report not found");

      // Delete video file from disk if present
      if (report.videoUrl) {
        try {
          const match = report.videoUrl.match(/\/services\/(.+)$/);
          if (match) {
            const filePath = path.join(
              process.cwd(),
              "data",
              "uploads",
              report.organizationId,
              "services",
              match[1]
            );
            await unlink(filePath);
          }
        } catch {
          // File may already be deleted
        }
      }

      await db.statusReport.delete({ where: { id: report.id } });

      return { deleted: true, statusReportId };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: "statusReport.delete",
        entity: "StatusReport",
        entityId: result.statusReportId,
        message: "Deleted status report",
      }),
    }
  );
}
