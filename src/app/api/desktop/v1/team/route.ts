import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";

export async function GET(request: Request) {
  return withDesktopAuth(request, async ({ organizationId }) => {
    const [members, roles, invitations] = await Promise.all([
      db.organizationMember.findMany({
        where: { organizationId },
        include: {
          user: { select: { id: true, name: true, email: true } },
          customRole: { select: { id: true, name: true } },
        },
      }),
      db.role.findMany({
        where: { organizationId },
        include: {
          _count: { select: { members: true } },
        },
      }),
      db.teamInvitation.findMany({
        where: { organizationId, status: "pending" },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        customRole: m.customRole
          ? { id: m.customRole.id, name: m.customRole.name }
          : undefined,
      })),
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        isAdmin: r.isAdmin,
        memberCount: r._count.members,
      })),
      invitations: invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        expiresAt: inv.expiresAt.toISOString(),
      })),
    });
  });
}
