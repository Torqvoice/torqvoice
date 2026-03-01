import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { updateNoteSchema } from "@/features/vehicles/Schema/noteSchema";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const { id, noteId } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const note = await db.note.findFirst({
        where: { id: noteId, vehicleId: id, vehicle: { organizationId } },
      });
      if (!note) {
        return NextResponse.json({ error: "Note not found" }, { status: 404 });
      }

      const body = await request.json();
      const data = updateNoteSchema.parse({ ...body, id: noteId });

      const updated = await db.note.update({
        where: { id: noteId },
        data,
      });

      return NextResponse.json({ note: updated });
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
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const { noteId } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const note = await db.note.findFirst({
        where: { id: noteId, vehicle: { organizationId } },
      });
      if (!note) {
        return NextResponse.json({ error: "Note not found" }, { status: 404 });
      }

      await db.note.delete({ where: { id: noteId } });
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
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const { noteId } = await params;

  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const note = await db.note.findFirst({
        where: { id: noteId, vehicle: { organizationId } },
      });
      if (!note) {
        return NextResponse.json({ error: "Note not found" }, { status: 404 });
      }

      const body = await request.json();

      if (body.action === "togglePin") {
        await db.note.update({
          where: { id: noteId },
          data: { isPinned: !note.isPinned },
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
