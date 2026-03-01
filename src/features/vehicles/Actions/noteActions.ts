"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createNoteSchema, updateNoteSchema } from "../Schema/noteSchema";
import { revalidatePath } from "next/cache";
import { recordDeletion } from "@/lib/sync-deletion";

export async function getNotesPaginated(
  vehicleId: string,
  params: { page?: number; pageSize?: number }
) {
  return withAuth(async ({ organizationId }) => {
    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
    });
    if (!vehicle) throw new Error("Vehicle not found");

    const page = params.page || 1;
    const pageSize = params.pageSize || 10;
    const skip = (page - 1) * pageSize;

    const [records, total] = await Promise.all([
      db.note.findMany({
        where: { vehicleId },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
      db.note.count({ where: { vehicleId } }),
    ]);

    return {
      records,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }] });
}

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

export async function updateNote(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    const data = updateNoteSchema.parse(input);
    const note = await db.note.findFirst({
      where: { id: data.id, vehicle: { organizationId } },
    });
    if (!note) throw new Error("Note not found");
    await db.note.update({ where: { id: data.id }, data });
    revalidatePath(`/vehicles/${note.vehicleId}`);
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

    await recordDeletion("note", noteId, organizationId);
    await db.note.delete({ where: { id: noteId } });
    revalidatePath(`/vehicles/${note.vehicleId}`);
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }] });
}
