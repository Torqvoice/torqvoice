import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { recordDeletion } from "@/lib/sync-deletion";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const { id } = await params;

      const inspection = await db.inspection.findFirst({
        where: { id, organizationId },
        include: {
          items: { select: { id: true } },
          boardAssignments: { select: { id: true } },
        },
      });
      if (!inspection) {
        return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
      }

      const deletions: Promise<void>[] = [recordDeletion("inspection", id, organizationId)];
      if (inspection.items.length) deletions.push(recordDeletion("inspectionItem", inspection.items.map((i) => i.id), organizationId));
      if (inspection.boardAssignments.length) deletions.push(recordDeletion("boardAssignment", inspection.boardAssignments.map((b) => b.id), organizationId));
      await Promise.all(deletions);

      await db.inspection.deleteMany({ where: { id, organizationId } });
      return new NextResponse(null, { status: 204 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.INSPECTIONS },
      ],
    },
  );
}
