"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import {
  generateServiceDescription,
  summarizeServiceHistory,
  buildQuoteFromText,
  testAiConnection,
} from "@/lib/ai";

export async function aiGenerateServiceNotes(serviceRecordId: string) {
  return withAuth(
    async ({ organizationId }) => {
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
      });
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
      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
        select: {
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

      return summarizeServiceHistory(organizationId, vehicle, vehicle.serviceRecords);
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}

export async function aiBuildQuoteFromText(
  freeText: string,
  vehicleId?: string | null,
) {
  return withAuth(
    async ({ organizationId }) => {
      let vehicle: { make: string; model: string; year: number } | null = null;

      if (vehicleId) {
        vehicle = await db.vehicle.findFirst({
          where: { id: vehicleId, organizationId },
          select: { make: true, model: true, year: true },
        });
      }

      // Fetch inventory for price matching
      const inventoryParts = await db.inventoryPart.findMany({
        where: { organizationId, isArchived: false },
        select: { name: true, unitCost: true, partNumber: true },
        take: 100,
      });

      return buildQuoteFromText(organizationId, freeText, vehicle, inventoryParts);
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
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
