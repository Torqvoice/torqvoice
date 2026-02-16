"use server";

import { headers, cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { acceptInvitationSchema } from "../Schema/teamSchema";

export async function acceptInvitation(input: unknown) {
  try {
    const data = acceptInvitationSchema.parse(input);

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return { success: false, error: "You must be signed in to accept an invitation" };
    }

    const invitation = await db.teamInvitation.findUnique({
      where: { token: data.token },
    });

    if (!invitation) {
      return { success: false, error: "Invitation not found" };
    }

    if (invitation.status !== "pending") {
      return { success: false, error: "This invitation is no longer valid" };
    }

    if (invitation.expiresAt < new Date()) {
      return { success: false, error: "This invitation has expired" };
    }

    if (invitation.email !== session.user.email) {
      return { success: false, error: "This invitation was sent to a different email address" };
    }

    // Check if already a member
    const existingMembership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, organizationId: invitation.organizationId },
    });
    if (existingMembership) {
      // Mark invitation as accepted even if already a member
      await db.teamInvitation.update({
        where: { id: invitation.id },
        data: { status: "accepted" },
      });
      return { success: true, data: { accepted: true } };
    }

    // Create membership and mark invitation as accepted
    await db.$transaction([
      db.organizationMember.create({
        data: {
          userId: session.user.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
          roleId: invitation.roleId,
        },
      }),
      db.teamInvitation.update({
        where: { id: invitation.id },
        data: { status: "accepted" },
      }),
    ]);

    // Set the active org cookie
    const cookieStore = await cookies();
    cookieStore.set("active-org-id", invitation.organizationId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return { success: true, data: { accepted: true } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("[acceptInvitation] Error:", message);
    return { success: false, error: message };
  }
}
