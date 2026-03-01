import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createReminderSchema } from "@/features/vehicles/Schema/reminderSchema";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const vehicle = await db.vehicle.findFirst({
        where: { id, organizationId },
        select: { id: true },
      });
      if (!vehicle) {
        return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
      }

      const body = await request.json();
      const data = createReminderSchema.parse({ ...body, vehicleId: id });

      const reminder = await db.reminder.create({
        data: {
          ...data,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
        },
      });

      return NextResponse.json({ reminder }, { status: 201 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}
