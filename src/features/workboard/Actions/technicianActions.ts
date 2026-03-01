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
import { recordDeletion } from "@/lib/sync-deletion";

export async function getTechnicians() {
  return withAuth(
    async ({ organizationId }) => {
      const technicians = await db.technician.findMany({
        where: { organizationId, isActive: true },
        orderBy: { sortOrder: "asc" },
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
          memberId: data.memberId || null,
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

      notificationBus.emit("workboard", {
        type: "technician_updated",
        organizationId,
        technicianId: id,
      });

      revalidatePath("/work-board");
      return technician;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD },
      ],
    },
  );
}

export async function deleteTechnician(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      await recordDeletion("technician", id, organizationId);
      await db.technician.deleteMany({
        where: { id, organizationId },
      });
      notificationBus.emit("workboard", {
        type: "technician_removed",
        organizationId,
        technicianId: id,
      });

      revalidatePath("/work-board");
      return { success: true };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.WORK_BOARD },
      ],
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
