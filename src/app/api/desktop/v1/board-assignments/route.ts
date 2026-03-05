import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createBoardAssignmentSchema } from "@/features/workboard/Schema/workboardSchema";

export async function POST(request: Request) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const body = await request.json();
      const data = createBoardAssignmentSchema.parse(body);

      const tech = await db.technician.findFirst({
        where: { id: data.technicianId, organizationId },
      });
      if (!tech) {
        return NextResponse.json({ error: "Technician not found" }, { status: 404 });
      }

      if (!data.serviceRecordId && !data.inspectionId) {
        return NextResponse.json({ error: "Must provide serviceRecordId or inspectionId" }, { status: 400 });
      }

      const assignment = await db.boardAssignment.create({
        data: {
          ...(body.id ? { id: body.id } : {}),
          date: new Date(data.date),
          sortOrder: data.sortOrder,
          notes: data.notes,
          technicianId: data.technicianId,
          serviceRecordId: data.serviceRecordId || null,
          inspectionId: data.inspectionId || null,
          organizationId,
        },
      });

      // Sync service record tech name and date
      if (assignment.serviceRecordId) {
        await db.serviceRecord.update({
          where: { id: assignment.serviceRecordId },
          data: { techName: tech.name, serviceDate: new Date(data.date) },
        });
      }

      return NextResponse.json({ assignment }, { status: 201 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.WORK_BOARD },
      ],
    },
  );
}
