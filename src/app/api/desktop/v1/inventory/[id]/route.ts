import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { updateInventoryPartSchema } from "@/features/inventory/Schema/inventorySchema";
import { recordDeletion } from "@/lib/sync-deletion";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const { id } = await params;
      const body = await request.json();
      const data = updateInventoryPartSchema.parse({ ...body, id });
      const { id: _id, ...updateData } = data;

      const result = await db.inventoryPart.updateMany({
        where: { id, organizationId },
        data: {
          ...updateData,
          partNumber: updateData.partNumber !== undefined ? (updateData.partNumber || null) : undefined,
          description: updateData.description !== undefined ? (updateData.description || null) : undefined,
          category: updateData.category !== undefined ? (updateData.category || null) : undefined,
          supplier: updateData.supplier !== undefined ? (updateData.supplier || null) : undefined,
          supplierPhone: updateData.supplierPhone !== undefined ? (updateData.supplierPhone || null) : undefined,
          supplierEmail: updateData.supplierEmail !== undefined ? (updateData.supplierEmail || null) : undefined,
          supplierUrl: updateData.supplierUrl !== undefined ? (updateData.supplierUrl || null) : undefined,
          location: updateData.location !== undefined ? (updateData.location || null) : undefined,
        },
      });
      if (result.count === 0) {
        return NextResponse.json({ error: "Part not found" }, { status: 404 });
      }

      const part = await db.inventoryPart.findUniqueOrThrow({ where: { id } });
      return NextResponse.json({ part });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.INVENTORY },
      ],
    },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const { id } = await params;

      await recordDeletion("inventoryPart", id, organizationId);
      const result = await db.inventoryPart.deleteMany({
        where: { id, organizationId },
      });
      if (result.count === 0) {
        return NextResponse.json({ error: "Part not found" }, { status: 404 });
      }

      return new NextResponse(null, { status: 204 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.INVENTORY },
      ],
    },
  );
}
