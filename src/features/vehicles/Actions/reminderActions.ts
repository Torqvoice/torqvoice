"use server";

import { toSafeDate } from "@/lib/invoice-utils";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createReminderSchema, updateReminderSchema } from "../Schema/reminderSchema";
import { revalidatePath } from "next/cache";

function revalidateReminderPaths(vehicleId: string | null) {
  if (vehicleId) revalidatePath(`/vehicles/${vehicleId}`);
  revalidatePath("/");
  revalidatePath("/reminders");
}

export async function getAllReminders() {
  return withAuth(async ({ organizationId }) => {
    return db.reminder.findMany({
      where: { organizationId },
      include: {
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            licensePlate: true,
            mileage: true,
          },
        },
        customer: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ isCompleted: "asc" }, { dueDate: "asc" }],
    });
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }] });
}

export async function createReminder(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    const data = createReminderSchema.parse(input);

    // A reminder relates to a vehicle, a customer, or just the workshop.
    // Whatever it relates to must belong to this organization.
    let customerId = data.customerId ?? null;
    if (data.vehicleId) {
      const vehicle = await db.vehicle.findFirst({
        where: { id: data.vehicleId, organizationId },
        select: { id: true, customerId: true },
      });
      if (!vehicle) throw new Error("Vehicle not found");
      // The vehicle wins: keep its customer link consistent with the vehicle
      customerId = vehicle.customerId;
    } else if (customerId) {
      const customer = await db.customer.findFirst({
        where: { id: customerId, organizationId },
        select: { id: true },
      });
      if (!customer) throw new Error("Customer not found");
    }

    const reminder = await db.reminder.create({
      data: {
        ...data,
        organizationId,
        vehicleId: data.vehicleId ?? null,
        customerId,
        dueDate: toSafeDate(data.dueDate) ?? null,
      },
    });
    revalidateReminderPaths(data.vehicleId ?? null);
    return reminder;
  }, {
    requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }],
    audit: ({ result }) => ({
      action: "reminder.create",
      entity: "Reminder",
      entityId: result.id,
      message: `Created reminder "${result.title}"`,
      metadata: { reminderId: result.id, vehicleId: result.vehicleId },
    }),
  });
}

export async function updateReminder(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    const { id, ...data } = updateReminderSchema.parse(input);
    const reminder = await db.reminder.findFirst({
      where: { id, organizationId },
    });
    if (!reminder) throw new Error("Reminder not found");

    // Ownership checks when the target changes
    let customerId = data.customerId;
    if (data.vehicleId) {
      const vehicle = await db.vehicle.findFirst({
        where: { id: data.vehicleId, organizationId },
        select: { id: true, customerId: true },
      });
      if (!vehicle) throw new Error("Vehicle not found");
      customerId = vehicle.customerId;
    } else if (data.customerId) {
      const customer = await db.customer.findFirst({
        where: { id: data.customerId, organizationId },
        select: { id: true },
      });
      if (!customer) throw new Error("Customer not found");
    }

    const newDueDate = data.dueDate !== undefined ? (toSafeDate(data.dueDate) ?? null) : undefined;
    const updated = await db.reminder.update({
      where: { id },
      data: {
        ...data,
        vehicleId: data.vehicleId !== undefined ? (data.vehicleId ?? null) : undefined,
        customerId: customerId !== undefined ? (customerId ?? null) : undefined,
        description: data.description !== undefined ? (data.description || null) : undefined,
        dueDate: newDueDate,
        dueMileage: data.dueMileage !== undefined ? (data.dueMileage ?? null) : undefined,
        // A rescheduled reminder should notify again when the new date comes due
        notifiedAt:
          newDueDate !== undefined && newDueDate?.getTime() !== reminder.dueDate?.getTime()
            ? null
            : undefined,
      },
    });
    revalidateReminderPaths(reminder.vehicleId);
    return updated;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }] });
}

export async function toggleReminder(reminderId: string) {
  return withAuth(async ({ organizationId }) => {
    const reminder = await db.reminder.findFirst({
      where: { id: reminderId, organizationId },
    });
    if (!reminder) throw new Error("Reminder not found");

    await db.reminder.update({
      where: { id: reminderId },
      data: { isCompleted: !reminder.isCompleted },
    });
    revalidateReminderPaths(reminder.vehicleId);
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }] });
}

export async function deleteReminder(reminderId: string) {
  return withAuth(async ({ organizationId }) => {
    const reminder = await db.reminder.findFirst({
      where: { id: reminderId, organizationId },
    });
    if (!reminder) throw new Error("Reminder not found");

    await db.reminder.delete({ where: { id: reminderId } });
    revalidateReminderPaths(reminder.vehicleId);
    return { reminderId };
  }, {
    requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }],
    audit: ({ result }) => ({
      action: "reminder.delete",
      entity: "Reminder",
      entityId: result.reminderId,
      message: `Deleted reminder ${result.reminderId}`,
      metadata: { reminderId: result.reminderId },
    }),
  });
}
