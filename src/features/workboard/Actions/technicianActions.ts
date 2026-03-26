"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { notificationBus } from "@/lib/notification-bus";
import {
  createTechnicianSchema,
  updateTechnicianSchema,
} from "../Schema/workboardSchema";

export async function getTechnicians() {
  return withAuth(
    async ({ organizationId }) => {
      const technicians = await db.technician.findMany({
        where: { organizationId, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          color: true,
          isActive: true,
          sortOrder: true,
          dailyCapacity: true,
          userId: true,
          organizationId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return technicians;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_BOARD },
      ],
    },
  );
}

export async function createTechnician(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = createTechnicianSchema.parse(input);

      const maxOrder = await db.technician.aggregate({
        where: { organizationId },
        _max: { sortOrder: true },
      });

      const technician = await db.technician.create({
        data: {
          name: data.name,
          color: data.color,
          userId: data.userId || null,
          sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
          organizationId,
        },
      });

      notificationBus.emit("workboard", {
        type: "technician_created",
        organizationId,
        technician,
      });

      revalidatePath("/work-board");
      return technician;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.WORK_BOARD },
      ],
      audit: ({ result }) => ({
        action: "technician.create",
        entity: "Technician",
        entityId: result.id,
        message: `Created technician "${result.name}"`,
        metadata: { technicianId: result.id, technicianName: result.name },
      }),
    },
  );
}

export async function updateTechnician(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = updateTechnicianSchema.parse(input);
      const { id, ...updates } = data;

      const technician = await db.technician.updateMany({
        where: { id, organizationId },
        data: updates,
      });

      // Sync denormalized techName on related service records when name changes
      if (updates.name) {
        await db.serviceRecord.updateMany({
          where: { technicianId: id },
          data: { techName: updates.name },
        });
      }

      notificationBus.emit("workboard", {
        type: "technician_updated",
        organizationId,
        technicianId: id,
      });

      revalidatePath("/work-board");
      return { ...technician, technicianId: id };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD },
      ],
      audit: ({ result }) => ({
        action: "technician.update",
        entity: "Technician",
        entityId: result.technicianId,
        message: `Updated technician ${result.technicianId}`,
        metadata: { technicianId: result.technicianId },
      }),
    },
  );
}

export async function deleteTechnician(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      await db.technician.deleteMany({
        where: { id, organizationId },
      });
      notificationBus.emit("workboard", {
        type: "technician_removed",
        organizationId,
        technicianId: id,
      });

      revalidatePath("/work-board");
      return { success: true, technicianId: id };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.WORK_BOARD },
      ],
      audit: ({ result }) => ({
        action: "technician.delete",
        entity: "Technician",
        entityId: result.technicianId,
        message: `Deleted technician ${result.technicianId}`,
        metadata: { technicianId: result.technicianId },
      }),
    },
  );
}

export async function getOrgMembers() {
  return withAuth(async ({ organizationId }) => {
    const members = await db.organizationMember.findMany({
      where: { organizationId },
      select: {
        userId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    return members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
    }));
  });
}
