"use server";

import { db } from "@/lib/db";
import { unlink } from "fs/promises";
import path from "path";

/**
 * Deletes expired status reports and their associated video files.
 * Called by the cleanup cron API route.
 */
export async function cleanupExpiredReports() {
  const now = new Date();

  // Find all expired reports with video files
  const expiredReports = await db.statusReport.findMany({
    where: {
      expiresAt: { lt: now },
    },
    select: {
      id: true,
      videoUrl: true,
      organizationId: true,
    },
  });

  if (expiredReports.length === 0) return { deleted: 0 };

  // Delete video files from disk
  for (const report of expiredReports) {
    if (report.videoUrl) {
      try {
        // videoUrl format: /api/protected/files/{orgId}/services/{filename}
        const match = report.videoUrl.match(/\/services\/(.+)$/);
        if (match) {
          const filename = path.basename(match[1]);
          const filePath = path.join(
            process.cwd(),
            "data",
            "uploads",
            report.organizationId,
            "services",
            filename
          );
          await unlink(filePath);
        }
      } catch {
        // File may already be deleted, continue
      }
    }
  }

  // Delete all expired reports from database
  const result = await db.statusReport.deleteMany({
    where: {
      expiresAt: { lt: now },
    },
  });

  return { deleted: result.count };
}
