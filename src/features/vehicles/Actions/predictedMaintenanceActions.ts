"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import {
  DEFAULT_APPROACHING_THRESHOLD,
  DEFAULT_SERVICE_INTERVAL,
  calculateConfidencePercent,
  evaluateServiceDue,
  predictMileageFromRecords,
  type ServiceDueStatus,
} from "@/features/vehicles/Lib/predictedMaintenance";

export type PredictedMileage = {
  predictedMileage: number;
  avgPerDay: number;
  lastServiceDate: Date;
  lastServiceMileage: number;
  confidence: number;
  confidencePercent: number;
};

export type VehicleDueForService = {
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
  predictedMileage: number;
  lastServiceMileage: number;
  mileageSinceLastService: number;
  serviceInterval: number;
  status: ServiceDueStatus;
  confidencePercent: number;
};

export async function getVehiclePredictedMileage(vehicleId: string) {
  return withAuth(async ({ organizationId }) => {
    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { mileage: true },
    });
    if (!vehicle) return null;

    const records = await db.serviceRecord.findMany({
      where: {
        vehicleId,
        organizationId,
        mileage: { not: null },
        status: "completed",
      },
      orderBy: [{ startDateTime: { sort: "asc", nulls: "last" } }, { serviceDate: "asc" }],
      select: { serviceDate: true, startDateTime: true, mileage: true },
    });

    const prediction = predictMileageFromRecords(records);
    if (!prediction) return null;

    return {
      // Never predict less than the vehicle's actual recorded mileage
      predictedMileage: Math.max(vehicle.mileage, prediction.predictedMileage),
      avgPerDay: Math.round(prediction.avgPerDay * 10) / 10,
      lastServiceDate: prediction.lastServiceDate,
      lastServiceMileage: prediction.lastServiceMileage,
      confidence: prediction.dataPoints,
      confidencePercent: calculateConfidencePercent(
        prediction.dataPoints,
        prediction.totalDays,
      ),
    } satisfies PredictedMileage;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }] });
}

export async function getVehiclesDueForService() {
  return withAuth(async ({ organizationId }) => {
    // Check if feature is enabled
    const settings = await db.appSetting.findMany({
      where: {
        organizationId,
        key: {
          in: [
            SETTING_KEYS.PREDICTED_MAINTENANCE_ENABLED,
            SETTING_KEYS.MAINTENANCE_SERVICE_INTERVAL,
            SETTING_KEYS.MAINTENANCE_APPROACHING_THRESHOLD,
          ],
        },
      },
    });

    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    if (settingsMap[SETTING_KEYS.PREDICTED_MAINTENANCE_ENABLED] !== "true") {
      return [];
    }

    const serviceInterval = parseInt(
      settingsMap[SETTING_KEYS.MAINTENANCE_SERVICE_INTERVAL] ||
        String(DEFAULT_SERVICE_INTERVAL),
      10
    );
    const approachingThreshold = parseInt(
      settingsMap[SETTING_KEYS.MAINTENANCE_APPROACHING_THRESHOLD] ||
        String(DEFAULT_APPROACHING_THRESHOLD),
      10
    );

    // Get all non-archived vehicles with their service records that have mileage
    const vehicles = await db.vehicle.findMany({
      where: { organizationId, isArchived: false, maintenanceDismissed: false },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        licensePlate: true,
        serviceRecords: {
          where: { mileage: { not: null }, status: "completed" },
          orderBy: [{ startDateTime: { sort: "asc", nulls: "last" } }, { serviceDate: "asc" }],
          select: { serviceDate: true, startDateTime: true, mileage: true },
        },
      },
    });

    const results: VehicleDueForService[] = [];

    for (const vehicle of vehicles) {
      const evaluation = evaluateServiceDue(vehicle.serviceRecords, {
        serviceInterval,
        approachingThreshold,
      });
      if (!evaluation) continue;

      results.push({
        vehicleId: vehicle.id,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        licensePlate: vehicle.licensePlate,
        predictedMileage: evaluation.predictedMileage,
        lastServiceMileage: evaluation.lastServiceMileage,
        mileageSinceLastService: evaluation.mileageSinceLastService,
        serviceInterval,
        status: evaluation.status,
        confidencePercent: evaluation.confidencePercent,
      });
    }

    // Sort: overdue first, then by mileage since last service descending
    results.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "overdue" ? -1 : 1;
      }
      return b.mileageSinceLastService - a.mileageSinceLastService;
    });

    return results;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }] });
}

export type DismissedMaintenanceVehicle = {
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
  dismissedAt: Date | null;
};

export async function getDismissedMaintenanceVehicles() {
  return withAuth(async ({ organizationId }) => {
    const vehicles = await db.vehicle.findMany({
      where: { organizationId, isArchived: false, maintenanceDismissed: true },
      orderBy: { maintenanceDismissedAt: "desc" },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        licensePlate: true,
        maintenanceDismissedAt: true,
      },
    });

    return vehicles.map((v) => ({
      vehicleId: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      licensePlate: v.licensePlate,
      dismissedAt: v.maintenanceDismissedAt,
    })) satisfies DismissedMaintenanceVehicle[];
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }] });
}
