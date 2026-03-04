import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";

export async function PUT(request: Request) {
  return withDesktopAuth(request, async ({ organizationId, isAdmin }) => {
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    const organization = await db.organization.update({
      where: { id: organizationId },
      data: { name: name.trim() },
      select: { id: true, name: true },
    });

    return NextResponse.json({ organization });
  });
}
