"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { assignRoleSchema } from "../Schema/teamSchema";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function assignRole(input: unknown) {
  return withAuth(async ({ organizationId, role, isSuperAdmin }) => {
    if (!isSuperAdmin && role !== "owner" && role !== "admin") {
      throw new Error("Only owners and admins can assign roles");
    }

    const data = assignRoleSchema.parse(input);

    const member = await db.organizationMember.findFirst({
      where: { id: data.memberId, organizationId },
    });
    if (!member) throw new Error("Member not found");
    if (member.role === "owner") throw new Error("Cannot assign a role to the owner");

    if (data.roleId) {
      const roleExists = await db.role.findFirst({
        where: { id: data.roleId, organizationId },
      });
      if (!roleExists) throw new Error("Role not found");
    }

    await db.organizationMember.update({
      where: { id: data.memberId },
      data: { roleId: data.roleId },
    });

    revalidatePath("/settings/team");
    return { assigned: true };
  }, { requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }] });
}
