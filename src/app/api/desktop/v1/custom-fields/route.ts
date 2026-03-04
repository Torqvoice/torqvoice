import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";

export async function GET(request: Request) {
  return withDesktopAuth(request, async ({ organizationId }) => {
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType");

    const where: Record<string, unknown> = { organizationId };
    if (entityType) where.entityType = entityType;

    const fields = await db.customFieldDefinition.findMany({
      where,
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ fields });
  });
}

export async function POST(request: Request) {
  return withDesktopAuth(request, async ({ organizationId, userId }) => {
    const body = await request.json();
    const { name, label, fieldType, options, required, entityType, sortOrder, isActive } = body;

    if (!name || !label || !entityType) {
      return NextResponse.json({ error: "name, label, and entityType are required" }, { status: 400 });
    }

    const field = await db.customFieldDefinition.create({
      data: {
        name,
        label,
        fieldType: fieldType || "text",
        options: options || null,
        required: required ?? false,
        entityType,
        sortOrder: sortOrder ?? 0,
        isActive: isActive ?? true,
        userId,
        organizationId,
      },
    });

    return NextResponse.json({ field });
  });
}
