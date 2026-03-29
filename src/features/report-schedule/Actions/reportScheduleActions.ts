"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import {
  createReportScheduleSchema,
  updateReportScheduleSchema,
} from "../Schema/reportScheduleSchema";

function calculateNextRunDate(from: Date, frequency: string): Date {
  const next = new Date(from);
  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "biweekly":
      next.setDate(next.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "bimonthly":
      next.setMonth(next.getMonth() + 2);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 4);
      break;
    case "semiannually":
      next.setMonth(next.getMonth() + 6);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  // Set to 8:00 AM
  next.setHours(8, 0, 0, 0);
  return next;
}

export async function getReportSchedules() {
  return withAuth(
    async ({ organizationId }) => {
      const schedules = await db.reportSchedule.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
      });

      return schedules.map((s) => ({
        ...s,
        sections: JSON.parse(s.sections) as string[],
        recipients: JSON.parse(s.recipients) as string[],
      }));
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.REPORTS },
      ],
    },
  );
}

export async function getOrgMembers() {
  return withAuth(
    async ({ organizationId }) => {
      const members = await db.organizationMember.findMany({
        where: { organizationId },
        select: {
          user: { select: { id: true, name: true, email: true } },
        },
      });
      return members.map((m) => m.user);
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.REPORTS },
      ],
    },
  );
}

export async function createReportSchedule(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const data = createReportScheduleSchema.parse(input);
      const nextRunDate = calculateNextRunDate(new Date(), data.frequency);

      const schedule = await db.reportSchedule.create({
        data: {
          name: data.name || "Scheduled Report",
          frequency: data.frequency,
          dateRange: data.dateRange || "last30d",
          sections: JSON.stringify(data.sections),
          recipients: JSON.stringify(data.recipients),
          nextRunDate,
          endDate: data.endDate ? new Date(data.endDate) : null,
          organizationId,
          createdById: userId,
        },
      });

      revalidatePath("/settings/report-schedule");
      return schedule;
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.CREATE,
          subject: PermissionSubject.REPORTS,
        },
      ],
    },
  );
}

export async function updateReportSchedule(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = updateReportScheduleSchema.parse(input);

      const existing = await db.reportSchedule.findFirst({
        where: { id: data.id, organizationId },
      });
      if (!existing) throw new Error("Schedule not found");

      const frequencyChanged = data.frequency !== existing.frequency;
      const nextRunDate = frequencyChanged
        ? calculateNextRunDate(new Date(), data.frequency)
        : existing.nextRunDate;

      const schedule = await db.reportSchedule.update({
        where: { id: data.id },
        data: {
          name: data.name || "Scheduled Report",
          frequency: data.frequency,
          dateRange: data.dateRange || "last30d",
          sections: JSON.stringify(data.sections),
          recipients: JSON.stringify(data.recipients),
          nextRunDate,
          endDate: data.endDate ? new Date(data.endDate) : null,
          isActive: data.isActive ?? existing.isActive,
        },
      });

      revalidatePath("/settings/report-schedule");
      return schedule;
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.REPORTS,
        },
      ],
    },
  );
}

export async function deleteReportSchedule(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const existing = await db.reportSchedule.findFirst({
        where: { id, organizationId },
      });
      if (!existing) throw new Error("Schedule not found");

      await db.reportSchedule.delete({ where: { id } });

      revalidatePath("/settings/report-schedule");
      return { deleted: true };
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.DELETE,
          subject: PermissionSubject.REPORTS,
        },
      ],
    },
  );
}

export async function sendReportNow(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const schedule = await db.reportSchedule.findFirst({
        where: { id, organizationId },
      });
      if (!schedule) throw new Error("Schedule not found");

      // Dynamically import and run the cron's processing logic for this single schedule
      const { processOneSchedule } = await import("@/lib/cron/report-schedules");
      await processOneSchedule(schedule);

      revalidatePath("/settings/report-schedule");
      return { sent: true };
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.REPORTS,
        },
      ],
    },
  );
}

export async function toggleReportSchedule(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const existing = await db.reportSchedule.findFirst({
        where: { id, organizationId },
      });
      if (!existing) throw new Error("Schedule not found");

      const isActive = !existing.isActive;
      const nextRunDate = isActive
        ? calculateNextRunDate(new Date(), existing.frequency)
        : existing.nextRunDate;

      const schedule = await db.reportSchedule.update({
        where: { id },
        data: { isActive, nextRunDate },
      });

      revalidatePath("/settings/report-schedule");
      return schedule;
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.REPORTS,
        },
      ],
    },
  );
}
