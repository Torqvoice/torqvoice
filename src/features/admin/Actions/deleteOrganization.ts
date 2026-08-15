"use server";

import { withSuperAdmin } from "@/lib/with-super-admin";
import { deleteOrganizationWithData } from "@/lib/delete-user-data";
import { deleteOrganizationSchema } from "../Schema/adminSchema";
import { demoGuard } from "@/lib/demo";

export async function deleteOrganization(input: { organizationId: string }) {
  return withSuperAdmin(async () => {
    demoGuard()
    const { organizationId } = deleteOrganizationSchema.parse(input);

    // Also cancels the org's Stripe subscription and removes its uploaded
    // files, which the previous bare `organization.delete` here leaked.
    await deleteOrganizationWithData(organizationId);

    return { deleted: true };
  });
}
