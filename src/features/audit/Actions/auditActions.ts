"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";

export async function getRecentAuditLogs(limit = 10) {
  return withAuth(async ({ organizationId }) => {
    const logs = await db.auditLog.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { timestamp: "desc" },
      take: limit,
    });
    return logs;
  });
}

