"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { isCloudMode, getMaxOrganizations } from "@/lib/features";
import { createOrganizationSchema } from "../Schema/teamSchema";
import { revalidatePath } from "next/cache";

export async function createNewOrganization(input: unknown) {
  return withAuth(async ({ userId }) => {
    const data = createOrganizationSchema.parse(input);

    if (isCloudMode()) {
      const ownedCount = await db.organizationMember.count({
        where: { userId, role: "owner" },
      });
      const maxOrgs = await getMaxOrganizations(userId);

      if (ownedCount >= maxOrgs) {
        throw new Error(
          `You have reached the maximum number of organizations (${maxOrgs}) for your plan. Upgrade to create more.`,
        );
      }
    }

    const org = await db.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: { name: data.name },
      });

      await tx.organizationMember.create({
        data: {
          userId,
          organizationId: created.id,
          role: "owner",
        },
      });

      return created;
    });

    // Auto-switch to the newly created organization
    const cookieStore = await cookies();
    cookieStore.set("active-org-id", org.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    revalidatePath("/");
    return org;
  });
}
