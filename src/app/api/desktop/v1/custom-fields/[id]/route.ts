import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDesktopAuth(request, async ({ organizationId }) => {
    const { id } = await params;
    const body = await request.json();
    const { label, fieldType, options, required, sortOrder, isActive } = body;

    const existing = await db.customFieldDefinition.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Field not found" }, { status: 404 });
    }

    const field = await db.customFieldDefinition.update({
      where: { id },
      data: {
        ...(label !== undefined && { label }),
        ...(fieldType !== undefined && { fieldType }),
        ...(options !== undefined && { options }),
        ...(required !== undefined && { required }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({ field });
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDesktopAuth(request, async ({ organizationId }) => {
    const { id } = await params;

    const existing = await db.customFieldDefinition.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Field not found" }, { status: 404 });
    }

    await db.customFieldValue.deleteMany({ where: { fieldId: id } });
    await db.customFieldDefinition.delete({ where: { id } });

    return NextResponse.json({ success: true });
  });
}
