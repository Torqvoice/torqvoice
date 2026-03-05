import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createInventoryPartSchema } from "@/features/inventory/Schema/inventorySchema";

export async function POST(request: Request) {
  return withDesktopAuth(
    request,
    async ({ userId, organizationId }) => {
      const body = await request.json();
      const data = createInventoryPartSchema.parse(body);

      const part = await db.inventoryPart.create({
        data: {
          ...(body.id ? { id: body.id } : {}),
          ...data,
          userId,
          organizationId,
        },
      });

      return NextResponse.json({ part }, { status: 201 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.INVENTORY },
      ],
    },
  );
}
