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
} from "../Schema/workboardSchema";

export type BoardAssignmentWithJob = {
  id: string;
  date: string;
  sortOrder: number;
  notes: string | null;
  technicianId: string;
  serviceRecordId: string | null;
  inspectionId: string | null;
  organizationId: string;
  serviceRecord?: {
    id: string;
    title: string;
    status: string;
    vehicle: {
      id: string;
      make: string;
      model: string;
      year: number;
      licensePlate: string | null;
    };
  } | null;
  inspection?: {
    id: string;
    status: string;
    vehicle: {
      id: string;
      make: string;
      model: string;
      year: number;
      licensePlate: string | null;
    };
    template: { name: string };
  } | null;
};

export async function getBoardAssignments(weekStart: string) {
  return withAuth(
    async ({ organizationId }) => {
      const start = new Date(weekStart);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);

      const assignments = await db.boardAssignment.findMany({
        where: {
          organizationId,
          date: { gte: start, lt: end },
        },
        include: {
          technician: true,
          serviceRecord: {
            select: {
              id: true,
              title: true,
              status: true,
              vehicle: {
                select: {
                  id: true,
                  make: true,
                  model: true,
                  year: true,
                  licensePlate: true,
                },
              },
            },
          },
          inspection: {
            select: {
              id: true,
              status: true,
              vehicle: {
                select: {
                  id: true,
                  make: true,
                  model: true,
                  year: true,
                  licensePlate: true,
                },
              },
              template: { select: { name: true } },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      });

      // Serialize dates to strings for client
      return assignments.map((a) => ({
        ...a,
        date: a.date.toISOString().split("T")[0],
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        technician: {
          ...a.technician,
          createdAt: a.technician.createdAt.toISOString(),
          updatedAt: a.technician.updatedAt.toISOString(),
        },
      }));
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
      // Get IDs of service records that have any board assignment
      const assignedServiceRecordIds = (
        await db.boardAssignment.findMany({
          where: { organizationId, serviceRecordId: { not: null } },
          select: { serviceRecordId: true },
          distinct: ["serviceRecordId"],
        })
      ).map((a) => a.serviceRecordId!);

      const assignedInspectionIds = (
        await db.boardAssignment.findMany({
          where: { organizationId, inspectionId: { not: null } },
          select: { inspectionId: true },
          distinct: ["inspectionId"],
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
            id: true,
            title: true,
            status: true,
            vehicle: {
              select: {
                id: true,
                make: true,
                model: true,
                year: true,
                licensePlate: true,
              },
            },
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
            id: true,
            status: true,
            vehicle: {
              select: {
                id: true,
                make: true,
                model: true,
                year: true,
                licensePlate: true,
              },
            },
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

      // Verify the technician belongs to this org
      const tech = await db.technician.findFirst({
        where: { id: data.technicianId, organizationId },
      });
      if (!tech) throw new Error("Technician not found");

      if (!data.serviceRecordId && !data.inspectionId) {
        throw new Error("Must provide serviceRecordId or inspectionId");
      }

      const assignment = await db.boardAssignment.create({
        data: {
          date: new Date(data.date),
          sortOrder: data.sortOrder,
          notes: data.notes,
          technicianId: data.technicianId,
          serviceRecordId: data.serviceRecordId || null,
          inspectionId: data.inspectionId || null,
          organizationId,
        },
        include: {
          technician: true,
          serviceRecord: {
            select: {
              id: true,
              title: true,
              status: true,
              vehicle: {
                select: { id: true, make: true, model: true, year: true, licensePlate: true },
              },
            },
          },
          inspection: {
            select: {
              id: true,
              status: true,
              vehicle: {
                select: { id: true, make: true, model: true, year: true, licensePlate: true },
              },
              template: { select: { name: true } },
            },
          },
        },
      });

      // Sync service record: techName + serviceDate from board
      if (assignment.serviceRecordId) {
        await db.serviceRecord.update({
          where: { id: assignment.serviceRecordId },
          data: { techName: tech.name, serviceDate: new Date(data.date) },
        });
      }

      notificationBus.emit("workboard", {
        type: "assignment_created",
        organizationId,
        assignment: {
          ...assignment,
          date: assignment.date.toISOString().split("T")[0],
          createdAt: assignment.createdAt.toISOString(),
          updatedAt: assignment.updatedAt.toISOString(),
          technician: {
            ...assignment.technician,
            createdAt: assignment.technician.createdAt.toISOString(),
            updatedAt: assignment.technician.updatedAt.toISOString(),
          },
        },
      });

      revalidatePath("/work-board");
      return {
        ...assignment,
        date: assignment.date.toISOString().split("T")[0],
        createdAt: assignment.createdAt.toISOString(),
        updatedAt: assignment.updatedAt.toISOString(),
        technician: {
          ...assignment.technician,
          createdAt: assignment.technician.createdAt.toISOString(),
          updatedAt: assignment.technician.updatedAt.toISOString(),
        },
      };
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

      const updated = await db.boardAssignment.update({
        where: { id: data.id },
        data: {
          technicianId: data.technicianId,
          date: new Date(data.date),
          sortOrder: data.sortOrder,
        },
        include: {
          technician: true,
          serviceRecord: {
            select: {
              id: true,
              title: true,
              status: true,
              vehicle: {
                select: { id: true, make: true, model: true, year: true, licensePlate: true },
              },
            },
          },
          inspection: {
            select: {
              id: true,
              status: true,
              vehicle: {
                select: { id: true, make: true, model: true, year: true, licensePlate: true },
              },
              template: { select: { name: true } },
            },
          },
        },
      });

      // Sync service record: techName + serviceDate from board
      if (updated.serviceRecordId) {
        await db.serviceRecord.update({
          where: { id: updated.serviceRecordId },
          data: { techName: updated.technician.name, serviceDate: new Date(data.date) },
        });
      }

      notificationBus.emit("workboard", {
        type: "assignment_moved",
        organizationId,
        assignment: {
          ...updated,
          date: updated.date.toISOString().split("T")[0],
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
          technician: {
            ...updated.technician,
            createdAt: updated.technician.createdAt.toISOString(),
            updatedAt: updated.technician.updatedAt.toISOString(),
          },
        },
      });

      revalidatePath("/work-board");
      return {
        ...updated,
        date: updated.date.toISOString().split("T")[0],
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        technician: {
          ...updated.technician,
          createdAt: updated.technician.createdAt.toISOString(),
          updatedAt: updated.technician.updatedAt.toISOString(),
        },
      };
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

      // Clear techName on the linked service record
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
