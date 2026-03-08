"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { notificationBus } from "@/lib/notification-bus";
import { updateServiceTimesSchema } from "../../Schema/workboardSchema";

export async function updateServiceTimes(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = updateServiceTimesSchema.parse(input);

      if (data.endDateTime <= data.startDateTime) {
        throw new Error("End time must be after start time");
      }

      const record = await db.serviceRecord.findFirst({
        where: { id: data.id, vehicle: { organizationId } },
      });
      if (!record) throw new Error("Service record not found");

      await db.serviceRecord.update({
        where: { id: data.id },
        data: {
          startDateTime: data.startDateTime,
          endDateTime: data.endDateTime,
        },
      });

      notificationBus.emit("workboard", {
        type: "service_times_updated",
        organizationId,
        serviceRecordId: data.id,
        startDateTime: data.startDateTime.toISOString(),
        endDateTime: data.endDateTime.toISOString(),
      });

      revalidatePath("/work-board");
      revalidatePath("/vehicles");
      return {
        id: data.id,
        startDateTime: data.startDateTime.toISOString(),
        endDateTime: data.endDateTime.toISOString(),
      };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD },
      ],
    },
  );
}

export async function updateInspectionTimes(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = updateServiceTimesSchema.parse(input);

      if (data.endDateTime <= data.startDateTime) {
        throw new Error("End time must be after start time");
      }

      const inspection = await db.inspection.findFirst({
        where: { id: data.id, organizationId },
      });
      if (!inspection) throw new Error("Inspection not found");

      await db.inspection.update({
        where: { id: data.id },
        data: {
          startDateTime: data.startDateTime,
          endDateTime: data.endDateTime,
        },
      });

      notificationBus.emit("workboard", {
        type: "inspection_times_updated",
        organizationId,
        inspectionId: data.id,
        startDateTime: data.startDateTime.toISOString(),
        endDateTime: data.endDateTime.toISOString(),
      });

      revalidatePath("/work-board");
      return {
        id: data.id,
        startDateTime: data.startDateTime.toISOString(),
        endDateTime: data.endDateTime.toISOString(),
      };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD },
      ],
    },
  );
}
