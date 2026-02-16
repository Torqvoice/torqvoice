"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function createDraftServiceRecord(vehicleId: string, serviceDate?: Date) {
  return withAuth(
    async ({ organizationId }) => {
      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
      });
      if (!vehicle) throw new Error("Vehicle not found");

      // Auto-populate shop name and invoice number
      const [settings, org] = await Promise.all([
        db.appSetting.findMany({
          where: {
            organizationId,
            key: {
              in: ["workshop.invoicePrefix", "workshop.invoiceStartNumber"],
            },
          },
        }),
        db.organization.findUnique({
          where: { id: organizationId },
          select: { name: true },
        }),
      ]);
      const settingsMap: Record<string, string> = {};
      for (const s of settings) settingsMap[s.key] = s.value;

      const shopName = org?.name || undefined;

      // Resolve invoice prefix
      const rawPrefix = settingsMap["workshop.invoicePrefix"] || "{year}-";
      const now = new Date();
      const prefix = rawPrefix
        .replace("{year}", now.getFullYear().toString())
        .replace("{month}", String(now.getMonth() + 1).padStart(2, "0"));

      // Generate sequential invoice number
      const startNumber = parseInt(
        settingsMap["workshop.invoiceStartNumber"] || "0",
        10
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

      const record = await db.serviceRecord.create({
        data: {
          title: "New Service Record",
          type: "maintenance",
          status: "pending",
          vehicleId,
          shopName,
          invoiceNumber,
          serviceDate: serviceDate ?? now,
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
    }
  );
}
