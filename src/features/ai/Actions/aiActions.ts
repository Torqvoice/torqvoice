"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { getLocale } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import {
  generateServiceDescription,
  summarizeServiceHistory,
  getCommonIssues,
  testAiConnection,
} from "@/lib/ai";
import { AI_MESSAGE_TYPES } from "@/features/ai/constants";

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

async function upsertAiMessage(vehicleId: string, type: string, content: string) {
  return db.aiGeneratedMessage.upsert({
    where: { vehicleId_type: { vehicleId, type } },
    create: { vehicleId, type, content },
    update: { content },
  });
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
              startDateTime: true,
              type: true,
              cost: true,
              mileage: true,
            },
            orderBy: [{ startDateTime: { sort: "asc", nulls: "last" } }, { serviceDate: "asc" }],
          },
        },
      });

      if (!vehicle) throw new Error("Vehicle not found");

      if (vehicle.serviceRecords.length === 0) {
        return "No service records found for this vehicle.";
      }

      const summary = await summarizeServiceHistory(organizationId, vehicle, vehicle.serviceRecords, locale);

      await upsertAiMessage(vehicle.id, AI_MESSAGE_TYPES.SUMMARY, summary);

      return summary;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}

export async function aiGetCommonIssues(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const locale = (await getLocale()) as Locale;
      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
        select: { id: true, make: true, model: true, year: true },
      });

      if (!vehicle) throw new Error("Vehicle not found");

      const issues = await getCommonIssues(organizationId, vehicle, locale);

      await upsertAiMessage(vehicle.id, AI_MESSAGE_TYPES.COMMON_ISSUES, issues);

      return issues;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.VEHICLES },
      ],
    },
  );
}

export async function aiClearMessage(vehicleId: string, type: string) {
  return withAuth(
    async ({ organizationId }) => {
      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
        select: { id: true },
      });
      if (!vehicle) throw new Error("Vehicle not found");

      await db.aiGeneratedMessage.deleteMany({
        where: { vehicleId: vehicle.id, type },
      });

      return true;
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
