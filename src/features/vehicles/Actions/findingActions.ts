"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import {
  createFindingSchema,
  updateFindingSchema,
  resolveFindingSchema,
} from "../Schema/findingSchema";
import { revalidatePath } from "next/cache";

export async function getServiceFindings(serviceRecordId: string) {
  return withAuth(
    async ({ organizationId }) => {
      return db.vehicleFinding.findMany({
        where: {
          serviceRecordId,
          vehicle: { organizationId },
        },
        orderBy: { createdAt: "desc" },
      });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.VEHICLES },
      ],
    }
  );
}

export async function getVehicleFindings(
  vehicleId: string,
  params: { page?: number; pageSize?: number }
) {
  return withAuth(
    async ({ organizationId }) => {
      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
      });
      if (!vehicle) throw new Error("Vehicle not found");

      const page = params.page || 1;
      const pageSize = params.pageSize || 10;
      const skip = (page - 1) * pageSize;

      const [records, total] = await Promise.all([
        db.vehicleFinding.findMany({
          where: { vehicleId },
          include: {
            serviceRecord: { select: { id: true, title: true } },
            resolvedServiceRecord: { select: { id: true, title: true } },
          },
          orderBy: [
            { status: "asc" },
            { createdAt: "desc" },
          ],
          skip,
          take: pageSize,
        }),
        db.vehicleFinding.count({ where: { vehicleId } }),
      ]);

      return {
        records,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.VEHICLES },
      ],
    }
  );
}

export async function createFinding(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = createFindingSchema.parse(input);
      const vehicle = await db.vehicle.findFirst({
        where: { id: data.vehicleId, organizationId },
      });
      if (!vehicle) throw new Error("Vehicle not found");

      const finding = await db.vehicleFinding.create({ data });
      revalidatePath(`/vehicles/${data.vehicleId}`);
      revalidatePath("/");
      return finding;
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.VEHICLES,
        },
      ],
      audit: ({ result }) => ({
        action: "finding.create",
        entity: "VehicleFinding",
        entityId: result.id,
        message: `Created finding "${result.description}" on vehicle ${result.vehicleId}`,
        metadata: { findingId: result.id, vehicleId: result.vehicleId },
      }),
    }
  );
}

export async function updateFinding(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { id, ...data } = updateFindingSchema.parse(input);
      const finding = await db.vehicleFinding.findFirst({
        where: { id, vehicle: { organizationId } },
      });
      if (!finding) throw new Error("Finding not found");

      const updated = await db.vehicleFinding.update({
        where: { id },
        data: {
          ...data,
          notes:
            data.notes !== undefined ? data.notes || null : undefined,
        },
      });
      revalidatePath(`/vehicles/${finding.vehicleId}`);
      revalidatePath("/");
      return updated;
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.VEHICLES,
        },
      ],
      audit: ({ result }) => ({
        action: "finding.update",
        entity: "VehicleFinding",
        entityId: result.id,
        message: `Updated finding "${result.description}"`,
        metadata: { findingId: result.id, vehicleId: result.vehicleId },
      }),
    }
  );
}

export async function resolveFinding(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = resolveFindingSchema.parse(input);
      const finding = await db.vehicleFinding.findFirst({
        where: { id: data.id, vehicle: { organizationId } },
      });
      if (!finding) throw new Error("Finding not found");

      const updated = await db.vehicleFinding.update({
        where: { id: data.id },
        data: {
          status: "resolved",
          resolvedServiceRecordId: data.resolvedServiceRecordId || null,
        },
      });
      revalidatePath(`/vehicles/${finding.vehicleId}`);
      revalidatePath("/");
      return updated;
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.VEHICLES,
        },
      ],
      audit: ({ result }) => ({
        action: "finding.resolve",
        entity: "VehicleFinding",
        entityId: result.id,
        message: `Resolved finding "${result.description}"`,
        metadata: { findingId: result.id, vehicleId: result.vehicleId },
      }),
    }
  );
}

export async function deleteFinding(findingId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const finding = await db.vehicleFinding.findFirst({
        where: { id: findingId, vehicle: { organizationId } },
      });
      if (!finding) throw new Error("Finding not found");

      await db.vehicleFinding.delete({ where: { id: findingId } });
      revalidatePath(`/vehicles/${finding.vehicleId}`);
      revalidatePath("/");
      return { findingId };
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.VEHICLES,
        },
      ],
      audit: ({ result }) => ({
        action: "finding.delete",
        entity: "VehicleFinding",
        entityId: result.findingId,
        message: `Deleted finding ${result.findingId}`,
        metadata: { findingId: result.findingId },
      }),
    }
  );
}
