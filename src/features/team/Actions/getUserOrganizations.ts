"use server";

import { getCachedSession } from "@/lib/cached-session";
import { db } from "@/lib/db";

export async function getUserOrganizations() {
  const session = await getCachedSession();

  if (!session?.user?.id) {
    return { success: false as const, error: "Unauthorized" };
  }

  const memberships = await db.organizationMember.findMany({
    where: { userId: session.user.id },
    select: {
      role: true,
      organization: {
        select: { id: true, name: true },
      },
    },
  });

  const organizations = memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    role: m.role,
  }));

  return { success: true as const, data: organizations };
}
