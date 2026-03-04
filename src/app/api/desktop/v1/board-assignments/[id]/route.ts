import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { moveAssignmentSchema } from "@/features/workboard/Schema/workboardSchema";
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
      const data = moveAssignmentSchema.parse({ ...body, id });

      const existing = await db.boardAssignment.findFirst({
        where: { id, organizationId },
      });
      if (!existing) {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }

      const updated = await db.boardAssignment.update({
        where: { id },
        data: {
          technicianId: data.technicianId,
          date: new Date(data.date),
          sortOrder: data.sortOrder,
        },
        include: { technician: true },
      });

      // Sync service record tech name and date
      if (updated.serviceRecordId) {
        await db.serviceRecord.update({
          where: { id: updated.serviceRecordId },
          data: { techName: updated.technician.name, serviceDate: new Date(data.date) },
        });
      }

      return NextResponse.json({ assignment: updated });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD },
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

      const assignment = await db.boardAssignment.findFirst({
        where: { id, organizationId },
      });
      if (!assignment) {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }

      // Clear techName on linked service record
      if (assignment.serviceRecordId) {
        await db.serviceRecord.update({
          where: { id: assignment.serviceRecordId },
          data: { techName: null },
        });
      }

      await recordDeletion("boardAssignment", id, organizationId);
      await db.boardAssignment.delete({ where: { id } });
      return new NextResponse(null, { status: 204 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.WORK_BOARD },
      ],
    },
  );
}
