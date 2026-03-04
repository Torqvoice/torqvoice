import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const { id } = await params;

      const inspection = await db.inspection.findFirst({
        where: { id, organizationId },
      });
      if (!inspection) {
        return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
      }

      await db.inspection.updateMany({
        where: { id, organizationId },
        data: { status: "completed", completedAt: new Date() },
      });

      const updated = await db.inspection.findUniqueOrThrow({ where: { id } });
      return NextResponse.json({ inspection: updated });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS },
      ],
    },
  );
}
