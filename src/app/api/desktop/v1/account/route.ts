import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";

export async function PUT(request: Request) {
  return withDesktopAuth(request, async ({ userId }) => {
    const body = await request.json();
    const { name, email } = body;

    // Build update data from provided fields
    const data: { name?: string; email?: string } = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Name must be a non-empty string" },
          { status: 400 },
        );
      }
      data.name = name.trim();
    }

    if (email !== undefined) {
      if (typeof email !== "string" || email.trim().length === 0) {
        return NextResponse.json(
          { error: "Email must be a non-empty string" },
          { status: 400 },
        );
      }
      // Basic email format check
      if (!email.includes("@")) {
        return NextResponse.json(
          { error: "Invalid email format" },
          { status: 400 },
        );
      }

      // Check if email is already in use by another user
      const existing = await db.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { id: true },
      });
      if (existing && existing.id !== userId) {
        return NextResponse.json(
          { error: "Email is already in use" },
          { status: 409 },
        );
      }

      data.email = email.trim().toLowerCase();
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No fields to update. Provide name and/or email." },
        { status: 400 },
      );
    }

    const user = await db.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json({ user });
  });
}
