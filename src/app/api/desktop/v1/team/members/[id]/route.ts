import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withDesktopAuth(request, async ({ organizationId, isAdmin }) => {
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { role, roleId } = body;

    if (!role || typeof role !== "string") {
      return NextResponse.json(
        { error: "role is required" },
        { status: 400 },
      );
    }

    // Find the member
    const member = await db.organizationMember.findFirst({
      where: { id, organizationId },
    });

    if (!member) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 },
      );
    }

    // Cannot change owner's role
    if (member.role === "owner") {
      return NextResponse.json(
        { error: "Cannot change the owner's role" },
        { status: 403 },
      );
    }

    // Validate roleId exists if provided
    if (roleId) {
      const customRole = await db.role.findFirst({
        where: { id: roleId, organizationId },
      });
      if (!customRole) {
        return NextResponse.json(
          { error: "Custom role not found" },
          { status: 404 },
        );
      }
    }

    const updated = await db.organizationMember.update({
      where: { id },
      data: {
        role,
        roleId: roleId || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        customRole: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      member: {
        id: updated.id,
        userId: updated.user.id,
        name: updated.user.name,
        email: updated.user.email,
        role: updated.role,
        customRole: updated.customRole
          ? { id: updated.customRole.id, name: updated.customRole.name }
          : undefined,
      },
    });
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withDesktopAuth(request, async ({ organizationId, isAdmin }) => {
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    // Find the member
    const member = await db.organizationMember.findFirst({
      where: { id, organizationId },
    });

    if (!member) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 },
      );
    }

    // Cannot remove the owner
    if (member.role === "owner") {
      return NextResponse.json(
        { error: "Cannot remove the organization owner" },
        { status: 403 },
      );
    }

    await db.organizationMember.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  });
}
