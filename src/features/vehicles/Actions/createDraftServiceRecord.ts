"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function createDraftServiceRecord(
  vehicleId: string,
  startDateTime?: Date,
  endDateTime?: Date,
  technicianId?: string,
) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
      });
      if (!vehicle) throw new Error("Vehicle not found");

      const [settings, org, currentUser] = await Promise.all([
        db.appSetting.findMany({
          where: {
            organizationId,
            key: {
              in: [
                "workshop.invoicePrefix",
                "workshop.invoiceStartNumber",
                "workshop.defaultTechnician",
                "workshop.defaultTechnicianId",
                "workboard.workDayStart",
              ],
            },
          },
        }),
        db.organization.findUnique({
          where: { id: organizationId },
          select: { name: true },
        }),
        db.user.findUnique({
          where: { id: userId },
          select: { name: true },
        }),
      ]);
      const settingsMap: Record<string, string> = {};
      for (const s of settings) settingsMap[s.key] = s.value;

      const shopName = org?.name || undefined;
      let techName = currentUser?.name || undefined;

      // Resolve technician: explicit param > default setting by ID > legacy default by name
      let resolvedTechId = technicianId;
      if (!resolvedTechId) {
        const defaultId = settingsMap["workshop.defaultTechnicianId"];
        if (defaultId) {
          const defaultTech = await db.technician.findFirst({
            where: { id: defaultId, organizationId, isActive: true },
            select: { id: true, name: true },
          });
          if (defaultTech) {
            resolvedTechId = defaultTech.id;
            techName = defaultTech.name;
          }
        }
        // Legacy fallback: look up by name
        if (!resolvedTechId && settingsMap["workshop.defaultTechnician"]) {
          const defaultTech = await db.technician.findFirst({
            where: { organizationId, name: settingsMap["workshop.defaultTechnician"], isActive: true },
            select: { id: true, name: true },
          });
          if (defaultTech) {
            resolvedTechId = defaultTech.id;
            techName = defaultTech.name;
          }
        }
      }

      // If a technician is resolved (explicit or default), use their name
      if (resolvedTechId) {
        const tech = await db.technician.findFirst({
          where: { id: resolvedTechId, organizationId },
          select: { name: true },
        });
        if (tech) techName = tech.name;
      }

      const rawPrefix = settingsMap["workshop.invoicePrefix"] || "{year}-";
      const now = new Date();
      const prefix = rawPrefix
        .replace("{year}", now.getFullYear().toString())
        .replace("{month}", String(now.getMonth() + 1).padStart(2, "0"));

      const startNumber = parseInt(
        settingsMap["workshop.invoiceStartNumber"] || "0",
        10,
      );
      const lastRecord = await db.serviceRecord.findFirst({
        where: { vehicle: { organizationId } },
        orderBy: { createdAt: "desc" },
        select: { invoiceNumber: true },
      });
      let nextNum = startNumber || 1001;
      if (lastRecord?.invoiceNumber) {
        const match = lastRecord.invoiceNumber.match(/(\d+)$/);
        if (match) {
          const lastNum = parseInt(match[1], 10) + 1;
          nextNum = Math.max(nextNum, lastNum);
        }
      }
      const invoiceNumber = `${prefix}${nextNum}`;

      if (startNumber && nextNum === startNumber) {
        await db.appSetting.updateMany({
          where: { organizationId, key: "workshop.invoiceStartNumber" },
          data: { value: "" },
        });
      }

      // Default to today's date at work day start time (from settings, fallback 07:00)
      let defaultStart: Date;
      if (!startDateTime) {
        const workDayStart = settingsMap["workboard.workDayStart"] || "07:00";
        const [h, m] = workDayStart.split(":").map(Number);
        defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
      } else {
        defaultStart = startDateTime;
      }
      // serviceDate should be date-only (start of day)
      const serviceDate = new Date(defaultStart.getFullYear(), defaultStart.getMonth(), defaultStart.getDate());

      const record = await db.serviceRecord.create({
        data: {
          title: "New Service Record",
          type: "maintenance",
          status: "pending",
          vehicleId,
          shopName,
          techName,
          technicianId: resolvedTechId || undefined,
          invoiceNumber,
          serviceDate,
          startDateTime: defaultStart,
          endDateTime: endDateTime ?? new Date(defaultStart.getTime() + 3600000),
        },
      });

      return record;
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.CREATE,
          subject: PermissionSubject.SERVICES,
        },
      ],
      audit: ({ result }) => ({
        action: "service.create",
        entity: "ServiceRecord",
        entityId: result.id,
        message: `Created draft service record ${result.invoiceNumber || result.id}`,
        metadata: { serviceRecordId: result.id, vehicleId: result.vehicleId },
      }),
    },
  );
}
