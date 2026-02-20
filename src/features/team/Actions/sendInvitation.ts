"use server";

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { sendInvitationSchema } from "../Schema/teamSchema";
import { sendOrgMail, getOrgFromAddress } from "@/lib/email";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

export async function sendInvitation(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    if (!organizationId) throw new Error("No organization found");
    const data = sendInvitationSchema.parse(input);

    // Fetch membership for organization name (authorization is handled by withAuth's requiredPermissions)
    const membership = await db.organizationMember.findFirst({
      where: { userId, organizationId },
      include: { organization: true },
    });
    if (!membership) throw new Error("You don't belong to an organization");

    // Check for existing pending invitation
    const existing = await db.teamInvitation.findFirst({
      where: {
        email: data.email,
        organizationId,
        status: "pending",
      },
    });
    if (existing) throw new Error("An invitation has already been sent to this email");

    // Remove any stale (cancelled/accepted/expired) invitations so the unique constraint doesn't block re-invites
    await db.teamInvitation.deleteMany({
      where: {
        email: data.email,
        organizationId,
        status: { not: "pending" },
      },
    });

    // Create invitation with 7-day expiry
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Validate and look up custom role name if roleId is provided
    let customRoleName: string | undefined;
    if (data.roleId) {
      const customRole = await db.role.findFirst({ where: { id: data.roleId, organizationId }, select: { name: true } });
      if (!customRole) throw new Error("Role not found");
      customRoleName = customRole.name;
    }

    const invitation = await db.teamInvitation.create({
      data: {
        email: data.email,
        role: data.role,
        token,
        expiresAt,
        organizationId,
        invitedById: userId,
        roleId: data.roleId,
      },
    });

    const from = await getOrgFromAddress(organizationId);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const signupUrl = `${baseUrl}/auth/sign-up?invite=${token}`;

    const roleLabel = customRoleName || data.role;

    try {
      await sendOrgMail(organizationId, {
        from,
        to: data.email,
        subject: `You've been invited to join ${membership.organization.name} on Torqvoice`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Team Invitation</h2>
            <p>You've been invited to join <strong>${membership.organization.name}</strong> on Torqvoice as a <strong>${roleLabel}</strong>.</p>
            <p>Click the button below to create your account and join the team:</p>
            <div style="margin: 24px 0;">
              <a href="${signupUrl}" style="display: inline-block; padding: 12px 24px; background-color: #171717; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 500;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This invitation expires in 7 days.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="color: #6b7280; font-size: 12px;">
              If the button doesn't work, copy and paste this URL into your browser:<br/>
              <a href="${signupUrl}" style="color: #6b7280;">${signupUrl}</a>
            </p>
          </div>
        `,
      });
    } catch (emailError) {
      // Roll back the invitation record so the admin can retry
      await db.teamInvitation.delete({ where: { id: invitation.id } });
      throw new Error("Failed to send invitation email. Please try again.");
    }

    revalidatePath("/settings/team");
    return { invited: true, pending: true };
  }, { requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }] });
}
