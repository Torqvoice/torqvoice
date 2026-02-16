"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { createOrganizationSchema, inviteMemberSchema, updateMemberRoleSchema } from "../Schema/teamSchema";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { getFeatures, FeatureGatedError } from "@/lib/features";

export async function getOrganization() {
  return withAuth(async ({ userId, organizationId }) => {
    // Find org where user is a member
    const membership = await db.organizationMember.findFirst({
      where: { userId, organizationId },
      include: {
        organization: {
          include: {
            members: {
              orderBy: { role: "asc" },
              include: {
                customRole: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!membership) return null;

    // Look up user details for each member
    const memberUserIds = membership.organization.members.map((m) => m.userId);
    const users = await db.user.findMany({
      where: { id: { in: memberUserIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const membersWithUsers = membership.organization.members.map((m) => ({
      id: m.id,
      role: m.role,
      roleId: m.roleId,
      customRoleName: m.customRole?.name || null,
      user: userMap.get(m.userId) || { id: m.userId, name: "Unknown", email: "" },
    }));

    return {
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        members: membersWithUsers,
      },
      currentRole: membership.role,
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }] });
}

export async function createOrganization(input: unknown) {
  return withAuth(async ({ userId }) => {
    const data = createOrganizationSchema.parse(input);

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

    revalidatePath("/settings/team");
    return org;
  }, { requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }] });
}

export async function inviteMember(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const data = inviteMemberSchema.parse(input);

    // Find caller's org and verify they are owner/admin
    const membership = await db.organizationMember.findFirst({
      where: { userId, organizationId },
      include: { organization: true },
    });

    if (!membership) throw new Error("You don't belong to an organization");
    if (membership.role === "member") throw new Error("Only owners and admins can invite members");

    const features = await getFeatures(organizationId);
    const memberCount = await db.organizationMember.count({ where: { organizationId } });
    if (memberCount >= features.maxUsers) {
      throw new FeatureGatedError("maxUsers", "Team member limit reached. Upgrade your plan to add more members.");
    }

    // Find user by email
    const invitedUser = await db.user.findFirst({
      where: { email: data.email },
    });
    if (!invitedUser) return { invited: false, userNotFound: true };

    // Check if already a member of this org
    const existingMembership = await db.organizationMember.findFirst({
      where: { userId: invitedUser.id, organizationId },
    });
    if (existingMembership) {
      throw new Error("This user is already a member");
    }

    await db.organizationMember.create({
      data: {
        userId: invitedUser.id,
        organizationId,
        role: data.role,
        roleId: data.roleId,
      },
    });

    revalidatePath("/settings/team");
    return { invited: true };
  }, { requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }] });
}

export async function updateMemberRole(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const data = updateMemberRoleSchema.parse(input);

    const membership = await db.organizationMember.findFirst({
      where: { userId, organizationId },
    });
    if (!membership) throw new Error("You don't belong to an organization");
    if (membership.role !== "owner") throw new Error("Only the owner can change roles");

    const target = await db.organizationMember.findFirst({
      where: { id: data.memberId, organizationId },
    });
    if (!target) throw new Error("Member not found");
    if (target.role === "owner") throw new Error("Cannot change the owner's role");

    await db.organizationMember.update({
      where: { id: data.memberId },
      data: { role: data.role },
    });

    revalidatePath("/settings/team");
    return { updated: true };
  }, { requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }] });
}

export async function removeMember(memberId: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const membership = await db.organizationMember.findFirst({
      where: { userId, organizationId },
    });
    if (!membership) throw new Error("You don't belong to an organization");
    if (membership.role === "member") throw new Error("Only owners and admins can remove members");

    const target = await db.organizationMember.findFirst({
      where: { id: memberId, organizationId },
    });
    if (!target) throw new Error("Member not found");
    if (target.role === "owner") throw new Error("Cannot remove the owner");
    if (target.userId === userId) throw new Error("Cannot remove yourself");

    await db.organizationMember.delete({ where: { id: memberId } });

    revalidatePath("/settings/team");
    return { removed: true };
  }, { requiredPermissions: [{ action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS }] });
}
