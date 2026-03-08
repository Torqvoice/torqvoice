"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { notificationBus } from "@/lib/notification-bus";
import {
  assignTechnicianSchema,
  moveJobSchema,
  unassignJobSchema,
} from "../../Schema/workboardSchema";
import type { WorkBoardJob, WorkBoardSettings } from "./types";

function serviceRecordToJob(sr: {
  id: string;
  title: string;
  status: string;
  startDateTime: Date | null;
  endDateTime: Date | null;
  technicianId: string | null;
  sortOrder: number;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
  };
}): WorkBoardJob {
  return {
    id: sr.id,
    type: "serviceRecord",
    technicianId: sr.technicianId,
    sortOrder: sr.sortOrder,
    title: sr.title,
    status: sr.status,
    startDateTime: sr.startDateTime?.toISOString() ?? null,
    endDateTime: sr.endDateTime?.toISOString() ?? null,
    vehicle: sr.vehicle,
  };
}

function inspectionToJob(insp: {
  id: string;
  status: string;
  startDateTime: Date | null;
  endDateTime: Date | null;
  technicianId: string | null;
  sortOrder: number;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
  };
  template: { name: string };
}): WorkBoardJob {
  return {
    id: insp.id,
    type: "inspection",
    technicianId: insp.technicianId,
    sortOrder: insp.sortOrder,
    title: insp.template.name,
    status: insp.status,
    startDateTime: insp.startDateTime?.toISOString() ?? null,
    endDateTime: insp.endDateTime?.toISOString() ?? null,
    vehicle: insp.vehicle,
    templateName: insp.template.name,
  };
}

const VEHICLE_SELECT = {
  id: true,
  make: true,
  model: true,
  year: true,
  licensePlate: true,
} as const;

export async function getBoardJobs(weekStart: string) {
  return withAuth(
    async ({ organizationId }) => {
      const start = new Date(weekStart);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);

      const [serviceRecords, inspections] = await Promise.all([
        db.serviceRecord.findMany({
          where: {
            vehicle: { organizationId },
            technicianId: { not: null },
            OR: [
              { startDateTime: { gte: start, lt: end } },
              { endDateTime: { gt: start, lte: end } },
              { startDateTime: { lte: start }, endDateTime: { gte: end } },
              { startDateTime: null },
            ],
          },
          select: {
            id: true,
            title: true,
            status: true,
            startDateTime: true,
            endDateTime: true,
            technicianId: true,
            sortOrder: true,
            vehicle: { select: VEHICLE_SELECT },
          },
          orderBy: { sortOrder: "asc" },
        }),
        db.inspection.findMany({
          where: {
            organizationId,
            technicianId: { not: null },
            OR: [
              { startDateTime: { gte: start, lt: end } },
              { endDateTime: { gt: start, lte: end } },
              { startDateTime: { lte: start }, endDateTime: { gte: end } },
              { startDateTime: null },
            ],
          },
          select: {
            id: true,
            status: true,
            startDateTime: true,
            endDateTime: true,
            technicianId: true,
            sortOrder: true,
            vehicle: { select: VEHICLE_SELECT },
            template: { select: { name: true } },
          },
          orderBy: { sortOrder: "asc" },
        }),
      ]);

      const jobs: WorkBoardJob[] = [
        ...serviceRecords.map(serviceRecordToJob),
        ...inspections.map(inspectionToJob),
      ];
      jobs.sort((a, b) => a.sortOrder - b.sortOrder);

      return jobs;
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
      const [serviceRecords, inspections] = await Promise.all([
        db.serviceRecord.findMany({
          where: {
            vehicle: { organizationId },
            technicianId: null,
            status: { in: ["pending", "in-progress", "waiting-parts", "scheduled"] },
          },
          select: {
            id: true,
            title: true,
            status: true,
            vehicle: { select: VEHICLE_SELECT },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        db.inspection.findMany({
          where: {
            organizationId,
            technicianId: null,
            status: { in: ["in_progress", "pending"] },
          },
          select: {
            id: true,
            status: true,
            vehicle: { select: VEHICLE_SELECT },
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

export async function assignTechnician(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = assignTechnicianSchema.parse(input);

      const tech = await db.technician.findFirst({
        where: { id: data.technicianId, organizationId },
      });
      if (!tech) throw new Error("Technician not found");

      let job: WorkBoardJob;

      const timeData = data.startDateTime && data.endDateTime
        ? { startDateTime: data.startDateTime, endDateTime: data.endDateTime }
        : {};

      if (data.type === "serviceRecord") {
        const sr = await db.serviceRecord.update({
          where: { id: data.id },
          data: { technicianId: data.technicianId, techName: tech.name, ...timeData },
          select: {
            id: true,
            title: true,
            status: true,
            startDateTime: true,
            endDateTime: true,
            technicianId: true,
            sortOrder: true,
            vehicle: { select: VEHICLE_SELECT },
          },
        });
        job = serviceRecordToJob(sr);
      } else {
        const insp = await db.inspection.update({
          where: { id: data.id },
          data: { technicianId: data.technicianId, ...timeData },
          select: {
            id: true,
            status: true,
            startDateTime: true,
            endDateTime: true,
            technicianId: true,
            sortOrder: true,
            vehicle: { select: VEHICLE_SELECT },
            template: { select: { name: true } },
          },
        });
        job = inspectionToJob(insp);
      }

      notificationBus.emit("workboard", {
        type: "job_assigned",
        organizationId,
        job,
      });

      revalidatePath("/work-board");
      return job;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.WORK_BOARD },
      ],
    },
  );
}

export async function moveJob(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = moveJobSchema.parse(input);

      const tech = await db.technician.findFirst({
        where: { id: data.technicianId, organizationId },
      });
      if (!tech) throw new Error("Technician not found");

      let job: WorkBoardJob;

      if (data.type === "serviceRecord") {
        const sr = await db.serviceRecord.update({
          where: { id: data.id },
          data: {
            technicianId: data.technicianId,
            sortOrder: data.sortOrder,
            techName: tech.name,
          },
          select: {
            id: true,
            title: true,
            status: true,
            startDateTime: true,
            endDateTime: true,
            technicianId: true,
            sortOrder: true,
            vehicle: { select: VEHICLE_SELECT },
          },
        });
        job = serviceRecordToJob(sr);
      } else {
        const insp = await db.inspection.update({
          where: { id: data.id },
          data: {
            technicianId: data.technicianId,
            sortOrder: data.sortOrder,
          },
          select: {
            id: true,
            status: true,
            startDateTime: true,
            endDateTime: true,
            technicianId: true,
            sortOrder: true,
            vehicle: { select: VEHICLE_SELECT },
            template: { select: { name: true } },
          },
        });
        job = inspectionToJob(insp);
      }

      notificationBus.emit("workboard", {
        type: "job_moved",
        organizationId,
        job,
      });

      revalidatePath("/work-board");
      return job;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD },
      ],
    },
  );
}

export async function unassignJob(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = unassignJobSchema.parse(input);

      if (data.type === "serviceRecord") {
        const sr = await db.serviceRecord.findFirst({
          where: { id: data.id, vehicle: { organizationId } },
        });
        if (!sr) throw new Error("Service record not found");

        await db.serviceRecord.update({
          where: { id: data.id },
          data: { technicianId: null, techName: null, sortOrder: 0 },
        });
      } else {
        const insp = await db.inspection.findFirst({
          where: { id: data.id, organizationId },
        });
        if (!insp) throw new Error("Inspection not found");

        await db.inspection.update({
          where: { id: data.id },
          data: { technicianId: null, sortOrder: 0 },
        });
      }

      notificationBus.emit("workboard", {
        type: "job_unassigned",
        organizationId,
        jobId: data.id,
        jobType: data.type,
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

export async function getWorkBoardSettings() {
  return withAuth(
    async ({ organizationId }) => {
      const settings = await db.appSetting.findMany({
        where: {
          organizationId,
          key: { in: ["workboard.weekStartDay", "workboard.workDayStart", "workboard.workDayEnd"] },
        },
      });

      const map: Record<string, string> = {};
      for (const s of settings) {
        map[s.key] = s.value;
      }

      return {
        weekStartDay: parseInt(map["workboard.weekStartDay"] || "1", 10),
        workDayStart: map["workboard.workDayStart"] || "07:00",
        workDayEnd: map["workboard.workDayEnd"] || "15:00",
      } as WorkBoardSettings;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_BOARD },
      ],
    },
  );
}
