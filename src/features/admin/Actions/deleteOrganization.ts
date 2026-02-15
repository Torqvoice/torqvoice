"use server";

import { withSuperAdmin } from "@/lib/with-super-admin";
import { db } from "@/lib/db";
import { deleteOrganizationSchema } from "../Schema/adminSchema";

export async function deleteOrganization(input: { organizationId: string }) {
  return withSuperAdmin(async () => {
    const { organizationId } = deleteOrganizationSchema.parse(input);

    await db.organization.delete({ where: { id: organizationId } });

    return { deleted: true };
  });
}
