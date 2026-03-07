"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import type { WorkBoardSettings } from "./types";

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

export async function getAssignmentForServiceRecord(serviceRecordId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const assignment = await db.boardAssignment.findFirst({
        where: { serviceRecordId, organizationId },
        select: {
          id: true,
          technician: { select: { id: true, name: true } },
        },
      });
      if (!assignment) return null;
      return {
        id: assignment.id,
        technician: assignment.technician,
      };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_BOARD },
      ],
    },
  );
}
