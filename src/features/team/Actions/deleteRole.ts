"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { demoGuard } from "@/lib/demo";

export async function deleteRole(roleId: string) {
  return withAuth(async ({ organizationId, role, isSuperAdmin }) => {
    demoGuard();
    if (!isSuperAdmin && role !== "owner" && role !== "admin") {
      throw new Error("Only owners and admins can delete roles");
    }

    const existing = await db.role.findFirst({
      where: { id: roleId, organizationId },
    });
    if (!existing) throw new Error("Role not found");

    await db.role.delete({ where: { id: roleId } });

    revalidatePath("/settings/team");
    return { deleted: true, roleId, roleName: existing.name };
  }, {
    requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }],
    audit: ({ result }) => ({
      action: "role.delete",
      entity: "Role",
      entityId: result.roleId,
      message: `Deleted role "${result.roleName}"`,
      metadata: { roleId: result.roleId, roleName: result.roleName },
    }),
  });
}
