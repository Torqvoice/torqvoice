"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getPendingInvitations() {
  return withAuth(async ({ organizationId }) => {
    const invitations = await db.teamInvitation.findMany({
      where: {
        organizationId,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        roleId: true,
        token: true,
        createdAt: true,
        expiresAt: true,
        customRole: {
          select: { name: true },
        },
      },
    });

    return invitations;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }] });
}
