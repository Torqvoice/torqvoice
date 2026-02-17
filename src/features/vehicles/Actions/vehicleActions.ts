"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createVehicleSchema, updateVehicleSchema } from "../Schema/vehicleSchema";
import { revalidatePath } from "next/cache";
import { unlink } from "fs/promises";
import { resolveUploadPath } from "@/lib/resolve-upload-path";

export async function getVehicles() {
  return withAuth(async ({ organizationId }) => {
    return db.vehicle.findMany({
      where: { organizationId, isArchived: false },
      include: {
        customer: { select: { id: true, name: true, company: true } },
        _count: {
          select: { serviceRecords: true, notes: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }] });
}

export async function getVehicle(vehicleId: string) {
  return withAuth(async ({ organizationId }) => {
    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      include: {
        customer: { select: { id: true, name: true, company: true, email: true, phone: true } },
        serviceRecords: {
          orderBy: { serviceDate: "desc" },
          take: 10,
          include: {
            _count: { select: { partItems: true, laborItems: true } },
          },
        },
        notes: { orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }] },
        reminders: {
          orderBy: [{ isCompleted: "asc" }, { dueDate: "asc" }],
          select: {
            id: true,
            title: true,
            description: true,
            dueDate: true,
            dueMileage: true,
            isCompleted: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            serviceRecords: true,
            notes: true,
            reminders: { where: { isCompleted: false } },
          },
        },
      },
    });

    if (!vehicle) throw new Error("Vehicle not found");
    return vehicle;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }] });
}

export async function getVehiclesPaginated(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  archived?: boolean;
}) {
  return withAuth(async ({ organizationId }) => {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const skip = (page - 1) * pageSize;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { organizationId, isArchived: params.archived ?? false };

    if (params.search) {
      where.OR = [
        { make: { contains: params.search, mode: "insensitive" } },
        { model: { contains: params.search, mode: "insensitive" } },
        { licensePlate: { contains: params.search, mode: "insensitive" } },
        { vin: { contains: params.search, mode: "insensitive" } },
        { customer: { name: { contains: params.search, mode: "insensitive" } } },
      ];
      if (!isNaN(Number(params.search))) {
        where.OR.push({ year: Number(params.search) });
      }
    }

    const [vehicles, total, archivedCount] = await Promise.all([
      db.vehicle.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, company: true } },
          _count: { select: { serviceRecords: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize,
      }),
      db.vehicle.count({ where }),
      db.vehicle.count({ where: { organizationId, isArchived: true } }),
    ]);

    return {
      vehicles,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      archivedCount,
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }] });
}

export async function createVehicle(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const data = createVehicleSchema.parse(input);
    const vehicle = await db.vehicle.create({
      data: {
        ...data,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
        customerId: data.customerId || null,
        userId,
        organizationId,
      },
    });
    revalidatePath("/");
    revalidatePath("/vehicles");
    return vehicle;
  }, { requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.VEHICLES }] });
}

export async function updateVehicle(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    const { id, ...data } = updateVehicleSchema.parse(input);

    // If image is being changed, delete the old file from disk
    if (data.imageUrl !== undefined) {
      const existing = await db.vehicle.findFirst({
        where: { id, organizationId },
        select: { imageUrl: true },
      });
      if (existing?.imageUrl && existing.imageUrl !== data.imageUrl) {
        try {
          await unlink(resolveUploadPath(existing.imageUrl));
        } catch {
          // Old file may already be gone
        }
      }
    }

    const vehicle = await db.vehicle.updateMany({
      where: { id, organizationId },
      data: {
        ...data,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
        customerId: data.customerId !== undefined ? (data.customerId || null) : undefined,
      },
    });
    revalidatePath("/");
    revalidatePath("/vehicles");
    revalidatePath(`/vehicles/${id}`);
    return vehicle;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }] });
}

export async function deleteVehicle(vehicleId: string) {
  return withAuth(async ({ organizationId }) => {
    // Fetch vehicle with its attachments so we can clean up files
    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        imageUrl: true,
        serviceRecords: {
          select: { attachments: { select: { fileUrl: true } } },
        },
      },
    });

    await db.vehicle.deleteMany({ where: { id: vehicleId, organizationId } });

    // Clean up files from disk after DB deletion
    if (vehicle) {
      const filesToDelete: string[] = [];
      if (vehicle.imageUrl) filesToDelete.push(vehicle.imageUrl);
      for (const sr of vehicle.serviceRecords) {
        for (const att of sr.attachments) {
          filesToDelete.push(att.fileUrl);
        }
      }
      for (const fileUrl of filesToDelete) {
        try {
          await unlink(resolveUploadPath(fileUrl));
        } catch {
          // File may already be gone
        }
      }
    }

    revalidatePath("/");
    revalidatePath("/vehicles");
  }, { requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.VEHICLES }] });
}
