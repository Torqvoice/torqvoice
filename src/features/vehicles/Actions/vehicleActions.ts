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
          orderBy: [{ startDateTime: { sort: "desc", nulls: "last" } }, { serviceDate: "desc" }],
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
        aiMessages: {
          select: { type: true, content: true, updatedAt: true },
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
      const words = params.search.trim().split(/\s+/).filter(Boolean);
      const fieldMatch = (word: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const conditions: any[] = [
          { make: { contains: word, mode: "insensitive" } },
          { model: { contains: word, mode: "insensitive" } },
          { licensePlate: { contains: word, mode: "insensitive" } },
          { vin: { contains: word, mode: "insensitive" } },
          { customer: { name: { contains: word, mode: "insensitive" } } },
        ];
        if (!isNaN(Number(word))) {
          conditions.push({ year: Number(word) });
        }
        return conditions;
      };
      if (words.length > 1) {
        where.AND = words.map((word: string) => ({ OR: fieldMatch(word) }));
      } else {
        where.OR = fieldMatch(words[0]);
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
  }, {
    requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.VEHICLES }],
    audit: ({ result }) => ({
      action: "vehicle.create",
      entity: "Vehicle",
      entityId: result.id,
      message: `Created vehicle ${result.year} ${result.make} ${result.model}`,
      metadata: { vehicleId: result.id },
    }),
  });
}

export async function updateVehicle(input: unknown) {
  return withAuth(async ({ organizationId, userId }) => {
    const { id, ...data } = updateVehicleSchema.parse(input);

    // Fetch current record for display/diff
    const before = await db.vehicle.findFirst({
      where: { id, organizationId },
      select: { year: true, make: true, model: true, licensePlate: true },
    });
    if (!before) throw new Error("Vehicle not found");

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

    const updateResult = await db.vehicle.updateMany({
      where: { id, organizationId },
      data: {
        ...data,
        vin: data.vin !== undefined ? (data.vin || null) : undefined,
        licensePlate: data.licensePlate !== undefined ? (data.licensePlate || null) : undefined,
        color: data.color !== undefined ? (data.color || null) : undefined,
        fuelType: data.fuelType !== undefined ? (data.fuelType || null) : undefined,
        transmission: data.transmission !== undefined ? (data.transmission || null) : undefined,
        engineSize: data.engineSize !== undefined ? (data.engineSize || null) : undefined,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
        customerId: data.customerId !== undefined ? (data.customerId || null) : undefined,
      },
    });
    if (updateResult.count === 0) throw new Error("Vehicle not found");
    const vehicleDisplay = `${before.year} ${before.make} ${before.model}${before.licensePlate ? ` (${before.licensePlate})` : ""}`;
    const changedKeys = Object.keys(data).filter((k) => (data as Record<string, unknown>)[k] !== undefined);
    revalidatePath("/");
    revalidatePath("/vehicles");
    revalidatePath(`/vehicles/${id}`);
    return { id, count: updateResult.count, fields: changedKeys, vehicleDisplay };
  }, {
    requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }],
    audit: ({ result }) => ({
      action: "vehicle.update",
      entity: "Vehicle",
      entityId: result.id,
      message: `Updated vehicle ${result.vehicleDisplay} — changed: ${result.fields.join(", ") || "(no changes)"}`,
      metadata: { vehicleId: result.id, vehicleDisplay: result.vehicleDisplay, changed: result.fields },
    }),
  });
}

export async function deleteVehicle(vehicleId: string) {
  return withAuth(async ({ organizationId, userId }) => {
    // Fetch vehicle with its attachments so we can clean up files
    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        imageUrl: true,
        year: true,
        make: true,
        model: true,
        licensePlate: true,
        serviceRecords: {
          select: { attachments: { select: { fileUrl: true } } },
        },
      },
    });
    if (!vehicle) throw new Error("Vehicle not found");

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

    const vehicleDisplay = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.licensePlate ? ` (${vehicle.licensePlate})` : ""}`;
    revalidatePath("/");
    revalidatePath("/vehicles");
    return { vehicleId, vehicleDisplay };
  }, {
    requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.VEHICLES }],
    audit: ({ result }) => ({
      action: "vehicle.delete",
      entity: "Vehicle",
      entityId: result.vehicleId,
      message: `Deleted vehicle ${result.vehicleDisplay}`,
      metadata: { vehicleId: result.vehicleId, vehicleDisplay: result.vehicleDisplay },
    }),
  });
}

export async function searchVehicles(search?: string, limit = 20, offset = 0) {
  return withAuth(async ({ organizationId }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { organizationId, isArchived: false };
    if (search) {
      const words = search.trim().split(/\s+/).filter(Boolean);
      const fieldMatch = (word: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const conditions: any[] = [
          { make: { contains: word, mode: "insensitive" } },
          { model: { contains: word, mode: "insensitive" } },
          { licensePlate: { contains: word, mode: "insensitive" } },
          { vin: { contains: word, mode: "insensitive" } },
          { customer: { name: { contains: word, mode: "insensitive" } } },
        ];
        if (!isNaN(Number(word))) {
          conditions.push({ year: Number(word) });
        }
        return conditions;
      };
      if (words.length > 1) {
        where.AND = words.map((word) => ({ OR: fieldMatch(word) }));
      } else {
        where.OR = fieldMatch(words[0]);
      }
    }
    return db.vehicle.findMany({
      where,
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        licensePlate: true,
        customerId: true,
        customer: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: offset,
      take: limit,
    });
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }] });
}
