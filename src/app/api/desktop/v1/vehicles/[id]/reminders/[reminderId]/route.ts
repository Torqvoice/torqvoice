import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { updateReminderSchema } from "@/features/vehicles/Schema/reminderSchema";
import { recordDeletion } from "@/lib/sync-deletion";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; reminderId: string }> },
) {
  const { reminderId } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const reminder = await db.reminder.findFirst({
        where: { id: reminderId, vehicle: { organizationId } },
      });
      if (!reminder) {
        return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
      }

      const body = await request.json();
      const { id: _id, ...data } = updateReminderSchema.parse({ ...body, id: reminderId });

      const updated = await db.reminder.update({
        where: { id: reminderId },
        data: {
          ...data,
          description: data.description !== undefined ? (data.description || null) : undefined,
          dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : undefined,
          dueMileage: data.dueMileage !== undefined ? (data.dueMileage ?? null) : undefined,
        },
      });

      return NextResponse.json({ reminder: updated });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; reminderId: string }> },
) {
  const { reminderId } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const reminder = await db.reminder.findFirst({
        where: { id: reminderId, vehicle: { organizationId } },
      });
      if (!reminder) {
        return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
      }

      await recordDeletion("reminder", reminderId, organizationId);
      await db.reminder.delete({ where: { id: reminderId } });
      return new NextResponse(null, { status: 204 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; reminderId: string }> },
) {
  const { reminderId } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const reminder = await db.reminder.findFirst({
        where: { id: reminderId, vehicle: { organizationId } },
      });
      if (!reminder) {
        return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
      }

      const body = await request.json();

      if (body.action === "toggle") {
        await db.reminder.update({
          where: { id: reminderId },
          data: { isCompleted: !reminder.isCompleted },
        });
        return NextResponse.json({ success: true });
      }

      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}
