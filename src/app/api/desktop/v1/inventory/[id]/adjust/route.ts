import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { adjustStockSchema } from "@/features/inventory/Schema/inventorySchema";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const { id } = await params;
      const body = await request.json();
      const { adjustment } = adjustStockSchema.parse({ ...body, id });

      const part = await db.inventoryPart.findFirst({
        where: { id, organizationId },
      });
      if (!part) {
        return NextResponse.json({ error: "Part not found" }, { status: 404 });
      }

      const newQuantity = part.quantity + adjustment;
      if (newQuantity < 0) {
        return NextResponse.json({ error: "Insufficient stock" }, { status: 400 });
      }

      await db.inventoryPart.updateMany({
        where: { id, organizationId },
        data: { quantity: newQuantity },
      });

      const updated = await db.inventoryPart.findUniqueOrThrow({ where: { id } });
      return NextResponse.json({ part: updated });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.INVENTORY },
      ],
    },
  );
}
