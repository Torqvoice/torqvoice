import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { updateInspectionItemSchema } from "@/features/inspections/Schema/inspectionSchema";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const { id, itemId } = await params;
      const body = await request.json();
      const data = updateInspectionItemSchema.parse(body);

      const item = await db.inspectionItem.findFirst({
        where: { id: itemId, inspectionId: id, inspection: { organizationId } },
      });
      if (!item) {
        return NextResponse.json({ error: "Inspection item not found" }, { status: 404 });
      }

      const updated = await db.inspectionItem.update({
        where: { id: itemId },
        data: {
          condition: data.condition,
          notes: data.notes,
          imageUrls: data.imageUrls,
        },
      });

      return NextResponse.json({ item: updated });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS },
      ],
    },
  );
}
