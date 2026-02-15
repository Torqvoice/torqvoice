"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createNoteSchema } from "../Schema/noteSchema";
import { revalidatePath } from "next/cache";

export async function createNote(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    const data = createNoteSchema.parse(input);
    const vehicle = await db.vehicle.findFirst({
      where: { id: data.vehicleId, organizationId },
    });
    if (!vehicle) throw new Error("Vehicle not found");

    const note = await db.note.create({ data });
    revalidatePath(`/vehicles/${data.vehicleId}`);
    return note;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }] });
}

export async function toggleNotePin(noteId: string) {
  return withAuth(async ({ organizationId }) => {
    const note = await db.note.findFirst({
      where: { id: noteId, vehicle: { organizationId } },
    });
    if (!note) throw new Error("Note not found");

    await db.note.update({
      where: { id: noteId },
      data: { isPinned: !note.isPinned },
    });
    revalidatePath(`/vehicles/${note.vehicleId}`);
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }] });
}

export async function deleteNote(noteId: string) {
  return withAuth(async ({ organizationId }) => {
    const note = await db.note.findFirst({
      where: { id: noteId, vehicle: { organizationId } },
    });
    if (!note) throw new Error("Note not found");

    await db.note.delete({ where: { id: noteId } });
    revalidatePath(`/vehicles/${note.vehicleId}`);
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }] });
}
