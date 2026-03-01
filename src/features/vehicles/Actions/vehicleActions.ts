"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createVehicleSchema, updateVehicleSchema } from "../Schema/vehicleSchema";
import { revalidatePath } from "next/cache";
import { unlink } from "fs/promises";
import { resolveUploadPath } from "@/lib/resolve-upload-path";
import { recordDeletion } from "@/lib/sync-deletion";

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
    if (vehicle.count === 0) throw new Error("Vehicle not found");
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
          select: {
            id: true,
            attachments: { select: { id: true, fileUrl: true } },
            partItems: { select: { id: true } },
            laborItems: { select: { id: true } },
            payments: { select: { id: true } },
            boardAssignments: { select: { id: true } },
          },
        },
        notes: { select: { id: true } },
        fuelLogs: { select: { id: true } },
        reminders: { select: { id: true } },
        quotes: {
          select: {
            id: true,
            partItems: { select: { id: true } },
            laborItems: { select: { id: true } },
            attachments: { select: { id: true } },
          },
        },
        recurringInvoices: { select: { id: true } },
        inspections: {
          select: {
            id: true,
            items: { select: { id: true } },
            boardAssignments: { select: { id: true } },
          },
        },
        serviceRequests: { select: { id: true } },
      },
    });
    if (!vehicle) throw new Error("Vehicle not found");

    // Record all cascade deletions before deleting
    const deletions: Promise<void>[] = [];
    for (const sr of vehicle.serviceRecords) {
      deletions.push(recordDeletion("serviceRecord", sr.id, organizationId));
      if (sr.partItems.length) deletions.push(recordDeletion("servicePart", sr.partItems.map(p => p.id), organizationId));
      if (sr.laborItems.length) deletions.push(recordDeletion("serviceLabor", sr.laborItems.map(l => l.id), organizationId));
      if (sr.attachments.length) deletions.push(recordDeletion("serviceAttachment", sr.attachments.map(a => a.id), organizationId));
      if (sr.payments.length) deletions.push(recordDeletion("payment", sr.payments.map(p => p.id), organizationId));
      if (sr.boardAssignments.length) deletions.push(recordDeletion("boardAssignment", sr.boardAssignments.map(b => b.id), organizationId));
    }
    if (vehicle.notes.length) deletions.push(recordDeletion("note", vehicle.notes.map(n => n.id), organizationId));
    if (vehicle.fuelLogs.length) deletions.push(recordDeletion("fuelLog", vehicle.fuelLogs.map(f => f.id), organizationId));
    if (vehicle.reminders.length) deletions.push(recordDeletion("reminder", vehicle.reminders.map(r => r.id), organizationId));
    for (const q of vehicle.quotes) {
      deletions.push(recordDeletion("quote", q.id, organizationId));
      if (q.partItems.length) deletions.push(recordDeletion("quotePart", q.partItems.map(p => p.id), organizationId));
      if (q.laborItems.length) deletions.push(recordDeletion("quoteLabor", q.laborItems.map(l => l.id), organizationId));
      if (q.attachments.length) deletions.push(recordDeletion("quoteAttachment", q.attachments.map(a => a.id), organizationId));
    }
    if (vehicle.recurringInvoices.length) deletions.push(recordDeletion("recurringInvoice", vehicle.recurringInvoices.map(r => r.id), organizationId));
    for (const insp of vehicle.inspections) {
      deletions.push(recordDeletion("inspection", insp.id, organizationId));
      if (insp.items.length) deletions.push(recordDeletion("inspectionItem", insp.items.map(i => i.id), organizationId));
      if (insp.boardAssignments.length) deletions.push(recordDeletion("boardAssignment", insp.boardAssignments.map(b => b.id), organizationId));
    }
    if (vehicle.serviceRequests.length) deletions.push(recordDeletion("serviceRequest", vehicle.serviceRequests.map(s => s.id), organizationId));
    deletions.push(recordDeletion("vehicle", vehicleId, organizationId));
    await Promise.all(deletions);

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
