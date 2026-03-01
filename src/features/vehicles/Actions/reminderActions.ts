"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createReminderSchema, updateReminderSchema } from "../Schema/reminderSchema";
import { revalidatePath } from "next/cache";
import { recordDeletion } from "@/lib/sync-deletion";

export async function createReminder(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    const data = createReminderSchema.parse(input);
    const vehicle = await db.vehicle.findFirst({
      where: { id: data.vehicleId, organizationId },
    });
    if (!vehicle) throw new Error("Vehicle not found");

    const reminder = await db.reminder.create({
      data: {
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });
    revalidatePath(`/vehicles/${data.vehicleId}`);
    revalidatePath("/");
    return reminder;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }] });
}

export async function updateReminder(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    const { id, ...data } = updateReminderSchema.parse(input);
    const reminder = await db.reminder.findFirst({
      where: { id, vehicle: { organizationId } },
    });
    if (!reminder) throw new Error("Reminder not found");

    const updated = await db.reminder.update({
      where: { id },
      data: {
        ...data,
        description: data.description !== undefined ? (data.description || null) : undefined,
        dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : undefined,
        dueMileage: data.dueMileage !== undefined ? (data.dueMileage ?? null) : undefined,
      },
    });
    revalidatePath(`/vehicles/${reminder.vehicleId}`);
    revalidatePath("/");
    return updated;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }] });
}

export async function toggleReminder(reminderId: string) {
  return withAuth(async ({ organizationId }) => {
    const reminder = await db.reminder.findFirst({
      where: { id: reminderId, vehicle: { organizationId } },
    });
    if (!reminder) throw new Error("Reminder not found");

    await db.reminder.update({
      where: { id: reminderId },
      data: { isCompleted: !reminder.isCompleted },
    });
    revalidatePath(`/vehicles/${reminder.vehicleId}`);
    revalidatePath("/");
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }] });
}

export async function deleteReminder(reminderId: string) {
  return withAuth(async ({ organizationId }) => {
    const reminder = await db.reminder.findFirst({
      where: { id: reminderId, vehicle: { organizationId } },
    });
    if (!reminder) throw new Error("Reminder not found");

    await recordDeletion("reminder", reminderId, organizationId);
    await db.reminder.delete({ where: { id: reminderId } });
    revalidatePath(`/vehicles/${reminder.vehicleId}`);
    revalidatePath("/");
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }] });
}
