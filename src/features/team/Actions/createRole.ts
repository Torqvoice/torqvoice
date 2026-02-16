"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { createRoleSchema } from "../Schema/teamSchema";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function createRole(input: unknown) {
  return withAuth(async ({ organizationId, role, isSuperAdmin }) => {
    if (!isSuperAdmin && role !== "owner" && role !== "admin") {
      throw new Error("Only owners and admins can create roles");
    }

    const data = createRoleSchema.parse(input);

    const created = await db.role.create({
      data: {
        name: data.name,
        isAdmin: data.isAdmin,
        organizationId,
        permissions: {
          create: data.permissions.map((p) => ({
            action: p.action,
            subject: p.subject,
          })),
        },
      },
      include: { permissions: true },
    });

    revalidatePath("/settings/team");
    return created;
  }, { requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }] });
}
