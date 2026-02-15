"use server";

import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function switchOrganization(organizationId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id, organizationId },
    select: { organizationId: true },
  });

  if (!membership) {
    return { success: false, error: "You are not a member of this organization" };
  }

  const cookieStore = await cookies();
  cookieStore.set("active-org-id", organizationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/");
  return { success: true };
}
