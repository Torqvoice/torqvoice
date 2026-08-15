"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { demoGuard } from "@/lib/demo";
import { deleteOrganizationWithData } from "@/lib/delete-user-data";

const deleteWorkshopSchema = z.object({ confirmName: z.string() });

/**
 * Owner-only self-service deletion of the active workshop and all of its
 * data. The typed name is re-checked server-side so the destructive call
 * can never be reached by a forged client request alone.
 *
 * No audit entry: audit rows carry the organizationId, and inserting one
 * for an organization that no longer exists violates the foreign key.
 */
export async function deleteWorkshop(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    // The shared demo user owns the demo org, so without this guard any
    // visitor could delete the demo.
    demoGuard();

    const membership = await db.organizationMember.findFirst({
      where: { userId, organizationId },
      select: { role: true },
    });
    if (membership?.role !== "owner") {
      throw new Error("Only the workshop owner can delete the workshop");
    }

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    if (!org) throw new Error("Workshop not found");

    const { confirmName } = deleteWorkshopSchema.parse(input);
    if (confirmName !== org.name) {
      throw new Error("The confirmation text does not match the workshop name");
    }

    await deleteOrganizationWithData(organizationId, userId);

    // The stale cookie would point at the deleted org; without it the layout
    // falls back to another membership, or to onboarding if none remain.
    (await cookies()).delete("active-org-id");

    return { deleted: true, name: org.name };
  });
}
