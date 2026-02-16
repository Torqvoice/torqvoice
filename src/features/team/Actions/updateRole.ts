"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { updateRoleSchema } from "../Schema/teamSchema";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function updateRole(input: unknown) {
  return withAuth(async ({ organizationId, role, isSuperAdmin }) => {
    if (!isSuperAdmin && role !== "owner" && role !== "admin") {
      throw new Error("Only owners and admins can update roles");
    }

    const data = updateRoleSchema.parse(input);

    const existing = await db.role.findFirst({
      where: { id: data.roleId, organizationId },
    });
    if (!existing) throw new Error("Role not found");

    const updated = await db.$transaction(async (tx) => {
      if (data.permissions) {
        await tx.permission.deleteMany({ where: { roleId: data.roleId } });
        await tx.permission.createMany({
          data: data.permissions.map((p) => ({
            roleId: data.roleId,
            action: p.action,
            subject: p.subject,
          })),
        });
      }

      return tx.role.update({
        where: { id: data.roleId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.isAdmin !== undefined && { isAdmin: data.isAdmin }),
        },
        include: { permissions: true },
      });
    });

    revalidatePath("/settings/team");
    return updated;
  }, { requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }] });
}
