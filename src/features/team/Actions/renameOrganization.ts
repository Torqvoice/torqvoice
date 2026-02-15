"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const renameOrgSchema = z.object({
  name: z.string().min(2).max(100).trim(),
});

export async function renameOrganization(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    const data = renameOrgSchema.parse(input);

    await db.organization.update({
      where: { id: organizationId },
      data: { name: data.name },
    });

    revalidatePath("/settings");
    revalidatePath("/");
    return true;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }] });
}
