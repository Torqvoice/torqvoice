"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { getLocale } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import {
  generateServiceDescription,
  summarizeServiceHistory,
  testAiConnection,
} from "@/lib/ai";

export async function aiGenerateServiceNotes(serviceRecordId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const locale = (await getLocale()) as Locale;
      const sr = await db.serviceRecord.findFirst({
        where: { id: serviceRecordId, vehicle: { organizationId } },
        include: {
          vehicle: { select: { make: true, model: true, year: true, licensePlate: true } },
          partItems: { select: { name: true, quantity: true } },
          laborItems: { select: { description: true, hours: true } },
        },
      });

      if (!sr) throw new Error("Service record not found");

      return generateServiceDescription(organizationId, {
        vehicleMake: sr.vehicle.make,
        vehicleModel: sr.vehicle.model,
        vehicleYear: sr.vehicle.year,
        licensePlate: sr.vehicle.licensePlate,
        serviceType: sr.type,
        serviceTitle: sr.title,
        parts: sr.partItems.map((p) => ({ name: p.name, quantity: p.quantity })),
        labor: sr.laborItems.map((l) => ({
          description: l.description,
          hours: l.hours,
        })),
      }, locale);
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}

export async function aiSummarizeVehicleHistory(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const locale = (await getLocale()) as Locale;
      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          serviceRecords: {
            select: {
              title: true,
              description: true,
              serviceDate: true,
              type: true,
              cost: true,
              mileage: true,
            },
            orderBy: { serviceDate: "asc" },
          },
        },
      });

      if (!vehicle) throw new Error("Vehicle not found");

      if (vehicle.serviceRecords.length === 0) {
        return "No service records found for this vehicle.";
      }

      const summary = await summarizeServiceHistory(organizationId, vehicle, vehicle.serviceRecords, locale);

      // Persist the summary to the vehicle record
      await db.vehicle.update({
        where: { id: vehicle.id },
        data: { aiSummary: summary, aiSummaryDate: new Date() },
      });

      return summary;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}

export async function aiTestConnection() {
  return withAuth(
    async ({ organizationId }) => {
      return testAiConnection(organizationId);
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS },
      ],
    },
  );
}
