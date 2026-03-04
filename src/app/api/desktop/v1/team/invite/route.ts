import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import crypto from "crypto";

export async function POST(request: Request) {
  return withDesktopAuth(request, async ({ organizationId, userId, isAdmin }) => {
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { email, role, roleId } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email is required" },
        { status: 400 },
      );
    }

    if (!role || typeof role !== "string") {
      return NextResponse.json(
        { error: "role is required" },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Validate roleId if provided
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

    // Check if user already a member
    const existingMember = await db.organizationMember.findFirst({
      where: {
        organizationId,
        user: { email: normalizedEmail },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member of this organization" },
        { status: 409 },
      );
    }

    // Check if user exists
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      // User exists, add them directly as a member
      await db.organizationMember.create({
        data: {
          userId: existingUser.id,
          organizationId,
          role,
          roleId: roleId || null,
        },
      });

      return NextResponse.json({
        success: true,
        invited: false,
        userNotFound: false,
      });
    }

    // User does not exist, create an invitation
    // Cancel any existing pending invitation for this email + org
    await db.teamInvitation.updateMany({
      where: {
        email: normalizedEmail,
        organizationId,
        status: "pending",
      },
      data: { status: "cancelled" },
    });

    await db.teamInvitation.create({
      data: {
        email: normalizedEmail,
        role,
        roleId: roleId || null,
        organizationId,
        invitedById: userId,
        token: crypto.randomUUID(),
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return NextResponse.json({
      success: true,
      invited: true,
      userNotFound: true,
    });
  });
}
