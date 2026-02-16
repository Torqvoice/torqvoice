"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { cancelInvitationSchema } from "../Schema/teamSchema";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

export async function cancelInvitation(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const data = cancelInvitationSchema.parse(input);

    // Verify caller is owner or admin
    const membership = await db.organizationMember.findFirst({
      where: { userId, organizationId },
    });
    if (!membership) throw new Error("You don't belong to an organization");
    if (membership.role === "member") throw new Error("Only owners and admins can cancel invitations");

    const invitation = await db.teamInvitation.findFirst({
      where: { id: data.invitationId, organizationId, status: "pending" },
    });
    if (!invitation) throw new Error("Invitation not found");

    await db.teamInvitation.update({
      where: { id: data.invitationId },
      data: { status: "cancelled" },
    });

    revalidatePath("/settings/team");
    return { cancelled: true };
  }, { requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }] });
}
