"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { notificationBus } from "@/lib/notification-bus";
import {
  createBoardAssignmentSchema,
  moveAssignmentSchema,
  removeAssignmentSchema,
} from "../../Schema/workboardSchema";
import type { BoardAssignmentWithJob } from "./types";

const SERVICE_RECORD_SELECT = {
  id: true,
  title: true,
  status: true,
  startDateTime: true,
  endDateTime: true,
  vehicle: {
    select: { id: true, make: true, model: true, year: true, licensePlate: true },
  },
} as const;

const INSPECTION_SELECT = {
  id: true,
  status: true,
  startDateTime: true,
  endDateTime: true,
  vehicle: {
    select: { id: true, make: true, model: true, year: true, licensePlate: true },
  },
  template: { select: { name: true } },
} as const;

function serializeAssignment(a: {
  id: string;
  sortOrder: number;
  notes: string | null;
  technicianId: string;
  serviceRecordId: string | null;
  inspectionId: string | null;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
  technician: { id: string; name: string; color: string; isActive: boolean; sortOrder: number; dailyCapacity: number; memberId: string | null; organizationId: string; createdAt: Date; updatedAt: Date };
  serviceRecord?: { id: string; title: string; status: string; startDateTime: Date | null; endDateTime: Date | null; vehicle: { id: string; make: string; model: string; year: number; licensePlate: string | null } } | null;
  inspection?: { id: string; status: string; startDateTime: Date | null; endDateTime: Date | null; vehicle: { id: string; make: string; model: string; year: number; licensePlate: string | null }; template: { name: string } } | null;
}): BoardAssignmentWithJob & Record<string, unknown> {
  return {
    ...a,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    technician: {
      ...a.technician,
      createdAt: a.technician.createdAt.toISOString(),
      updatedAt: a.technician.updatedAt.toISOString(),
    },
    serviceRecord: a.serviceRecord ? {
      ...a.serviceRecord,
      startDateTime: a.serviceRecord.startDateTime?.toISOString() ?? null,
      endDateTime: a.serviceRecord.endDateTime?.toISOString() ?? null,
    } : null,
    inspection: a.inspection ? {
      ...a.inspection,
      startDateTime: a.inspection.startDateTime?.toISOString() ?? null,
      endDateTime: a.inspection.endDateTime?.toISOString() ?? null,
    } : null,
  };
}

export async function getBoardAssignments(weekStart: string) {
  return withAuth(
    async ({ organizationId }) => {
      const start = new Date(weekStart);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);

      const assignments = await db.boardAssignment.findMany({
        where: {
          organizationId,
          OR: [
            {
              serviceRecord: {
                OR: [
                  { startDateTime: { gte: start, lt: end } },
                  { endDateTime: { gt: start, lte: end } },
                  { startDateTime: { lte: start }, endDateTime: { gte: end } },
                ],
              },
            },
            {
              inspection: {
                OR: [
                  { startDateTime: { gte: start, lt: end } },
                  { endDateTime: { gt: start, lte: end } },
                  { startDateTime: { lte: start }, endDateTime: { gte: end } },
                ],
              },
            },
            // Fallback: records without dates
            {
              serviceRecord: { startDateTime: null },
            },
            {
              inspection: { startDateTime: null },
            },
          ],
        },
        include: {
          technician: true,
          serviceRecord: { select: SERVICE_RECORD_SELECT },
          inspection: { select: INSPECTION_SELECT },
        },
        orderBy: { sortOrder: "asc" },
      });

      return assignments.map(serializeAssignment);
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_BOARD },
      ],
    },
  );
}

export async function getUnassignedJobs() {
  return withAuth(
    async ({ organizationId }) => {
      const assignedServiceRecordIds = (
        await db.boardAssignment.findMany({
          where: { organizationId, serviceRecordId: { not: null } },
          select: { serviceRecordId: true },
        })
      ).map((a) => a.serviceRecordId!);

      const assignedInspectionIds = (
        await db.boardAssignment.findMany({
          where: { organizationId, inspectionId: { not: null } },
          select: { inspectionId: true },
        })
      ).map((a) => a.inspectionId!);

      const [serviceRecords, inspections] = await Promise.all([
        db.serviceRecord.findMany({
          where: {
            vehicle: { organizationId },
            status: { in: ["pending", "in-progress", "waiting-parts", "scheduled"] },
            id: { notIn: assignedServiceRecordIds },
          },
          select: {
            id: true, title: true, status: true,
            vehicle: { select: { id: true, make: true, model: true, year: true, licensePlate: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        db.inspection.findMany({
          where: {
            organizationId,
            status: { in: ["in_progress", "pending"] },
            id: { notIn: assignedInspectionIds },
          },
          select: {
            id: true, status: true,
            vehicle: { select: { id: true, make: true, model: true, year: true, licensePlate: true } },
            template: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      ]);

      return { serviceRecords, inspections };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_BOARD },
      ],
    },
  );
}

export async function createBoardAssignment(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = createBoardAssignmentSchema.parse(input);

      const tech = await db.technician.findFirst({
        where: { id: data.technicianId, organizationId },
      });
      if (!tech) throw new Error("Technician not found");

      if (!data.serviceRecordId && !data.inspectionId) {
        throw new Error("Must provide serviceRecordId or inspectionId");
      }

      // Sync techName on service record
      if (data.serviceRecordId) {
        await db.serviceRecord.update({
          where: { id: data.serviceRecordId },
          data: { techName: tech.name },
        });
      }

      const assignment = await db.boardAssignment.create({
        data: {
          sortOrder: data.sortOrder,
          notes: data.notes,
          technicianId: data.technicianId,
          serviceRecordId: data.serviceRecordId || null,
          inspectionId: data.inspectionId || null,
          organizationId,
        },
        include: {
          technician: true,
          serviceRecord: { select: SERVICE_RECORD_SELECT },
          inspection: { select: INSPECTION_SELECT },
        },
      });

      const serialized = serializeAssignment(assignment);

      notificationBus.emit("workboard", {
        type: "assignment_created",
        organizationId,
        assignment: serialized,
      });

      revalidatePath("/work-board");
      return serialized;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.WORK_BOARD },
      ],
    },
  );
}

export async function moveAssignment(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = moveAssignmentSchema.parse(input);

      const assignment = await db.boardAssignment.findFirst({
        where: { id: data.id, organizationId },
      });
      if (!assignment) throw new Error("Assignment not found");

      const tech = await db.technician.findFirst({
        where: { id: data.technicianId, organizationId },
      });
      if (!tech) throw new Error("Technician not found");

      const updated = await db.boardAssignment.update({
        where: { id: data.id },
        data: { technicianId: data.technicianId, sortOrder: data.sortOrder },
        include: {
          technician: true,
          serviceRecord: { select: SERVICE_RECORD_SELECT },
          inspection: { select: INSPECTION_SELECT },
        },
      });

      // Sync techName
      if (updated.serviceRecordId) {
        await db.serviceRecord.update({
          where: { id: updated.serviceRecordId },
          data: { techName: tech.name },
        });
      }

      const serialized = serializeAssignment(updated);

      notificationBus.emit("workboard", {
        type: "assignment_moved",
        organizationId,
        assignment: serialized,
      });

      revalidatePath("/work-board");
      return serialized;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD },
      ],
    },
  );
}

export async function removeAssignment(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = removeAssignmentSchema.parse(input);

      const assignment = await db.boardAssignment.findFirst({
        where: { id: data.id, organizationId },
      });
      if (!assignment) throw new Error("Assignment not found");

      if (assignment.serviceRecordId) {
        await db.serviceRecord.update({
          where: { id: assignment.serviceRecordId },
          data: { techName: null },
        });
      }

      await db.boardAssignment.delete({ where: { id: data.id } });

      notificationBus.emit("workboard", {
        type: "assignment_removed",
        organizationId,
        assignmentId: data.id,
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
