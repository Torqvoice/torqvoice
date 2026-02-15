"use server";

import { headers, cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { onboardingSchema } from "../Schema/onboardingSchema";
import type { ActionResult } from "@/lib/with-auth";

export async function createOnboardingOrg(
  input: unknown,
): Promise<ActionResult<{ organizationId: string }>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    const data = onboardingSchema.parse(input);

    // Guard against duplicate org creation
    const existingMembership = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
    });
    if (existingMembership) {
      return { success: false, error: "You already belong to an organization" };
    }

    const org = await db.organization.create({
      data: { name: data.workshopName },
    });

    await db.organizationMember.create({
      data: {
        userId: session.user.id,
        organizationId: org.id,
        role: "owner",
      },
    });

    const cookieStore = await cookies();
    cookieStore.set("active-org-id", org.id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });

    return { success: true, data: { organizationId: org.id } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("[createOnboardingOrg] Error:", message);
    return { success: false, error: message };
  }
}
