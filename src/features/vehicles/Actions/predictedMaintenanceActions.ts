"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export type PredictedMileage = {
  predictedMileage: number;
  avgPerDay: number;
  lastServiceDate: Date;
  lastServiceMileage: number;
  confidence: number;
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
  status: "overdue" | "approaching";
};

export async function getVehiclePredictedMileage(vehicleId: string) {
  return withAuth(async ({ organizationId }) => {
    const records = await db.serviceRecord.findMany({
      where: {
        vehicleId,
        vehicle: { organizationId },
        mileage: { not: null },
        status: "completed",
      },
      orderBy: { serviceDate: "asc" },
      select: { serviceDate: true, mileage: true },
    });

    if (records.length < 2) return null;

    const dataPoints = records.map((r) => ({
      date: new Date(r.serviceDate),
      mileage: r.mileage!,
    }));

    const earliest = dataPoints[0];
    const latest = dataPoints[dataPoints.length - 1];

    // Linear regression: calculate average distance per day across all data points
    const totalDays =
      (latest.date.getTime() - earliest.date.getTime()) / (1000 * 60 * 60 * 24);

    if (totalDays <= 0) return null;

    const totalMileage = latest.mileage - earliest.mileage;
    const avgPerDay = totalMileage / totalDays;

    if (avgPerDay <= 0) return null;

    // Project from latest known data point to today
    const daysSinceLatest =
      (Date.now() - latest.date.getTime()) / (1000 * 60 * 60 * 24);
    const predictedMileage = Math.round(
      latest.mileage + daysSinceLatest * avgPerDay
    );

    return {
      predictedMileage,
      avgPerDay: Math.round(avgPerDay * 10) / 10,
      lastServiceDate: latest.date,
      lastServiceMileage: latest.mileage,
      confidence: dataPoints.length,
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
      settingsMap[SETTING_KEYS.MAINTENANCE_SERVICE_INTERVAL] || "15000",
      10
    );
    const approachingThreshold = parseInt(
      settingsMap[SETTING_KEYS.MAINTENANCE_APPROACHING_THRESHOLD] || "1000",
      10
    );

    // Get all non-archived vehicles with their service records that have mileage
    const vehicles = await db.vehicle.findMany({
      where: { organizationId, isArchived: false },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        licensePlate: true,
        serviceRecords: {
          where: { mileage: { not: null }, status: "completed" },
          orderBy: { serviceDate: "asc" },
          select: { serviceDate: true, mileage: true },
        },
      },
    });

    const results: VehicleDueForService[] = [];

    for (const vehicle of vehicles) {
      const records = vehicle.serviceRecords;
      if (records.length < 2) continue;

      const earliest = records[0];
      const latest = records[records.length - 1];

      const totalDays =
        (new Date(latest.serviceDate).getTime() -
          new Date(earliest.serviceDate).getTime()) /
        (1000 * 60 * 60 * 24);

      if (totalDays <= 0) continue;

      const totalMileage = latest.mileage! - earliest.mileage!;
      const avgPerDay = totalMileage / totalDays;

      if (avgPerDay <= 0) continue;

      const daysSinceLatest =
        (Date.now() - new Date(latest.serviceDate).getTime()) /
        (1000 * 60 * 60 * 24);
      const predictedMileage = Math.round(
        latest.mileage! + daysSinceLatest * avgPerDay
      );

      const lastServiceMileage = latest.mileage!;
      const mileageSinceLastService = predictedMileage - lastServiceMileage;

      let status: "overdue" | "approaching" | null = null;

      if (mileageSinceLastService >= serviceInterval) {
        status = "overdue";
      } else if (
        mileageSinceLastService >=
        serviceInterval - approachingThreshold
      ) {
        status = "approaching";
      }

      if (status) {
        results.push({
          vehicleId: vehicle.id,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          licensePlate: vehicle.licensePlate,
          predictedMileage,
          lastServiceMileage,
          mileageSinceLastService,
          serviceInterval,
          status,
        });
      }
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
