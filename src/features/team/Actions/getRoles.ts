"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getRoles() {
  return withAuth(async ({ organizationId }) => {
    const roles = await db.role.findMany({
      where: { organizationId },
      include: {
        permissions: { select: { action: true, subject: true } },
        _count: { select: { members: true } },
      },
      orderBy: { name: "asc" },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      isAdmin: r.isAdmin,
      permissions: r.permissions,
      memberCount: r._count.members,
    }));
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }] });
}
