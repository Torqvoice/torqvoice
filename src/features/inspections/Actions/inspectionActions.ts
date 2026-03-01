"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { createInspectionSchema, updateInspectionItemSchema } from "../Schema/inspectionSchema";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { notificationBus } from "@/lib/notification-bus";
import { recordDeletion } from "@/lib/sync-deletion";

export async function getInspectionsPaginated(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}) {
  return withAuth(async ({ organizationId }) => {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const skip = (page - 1) * pageSize;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { organizationId };

    if (params.status && params.status !== "all") {
      where.status = params.status;
    }

    if (params.search) {
      where.OR = [
        { vehicle: { make: { contains: params.search, mode: "insensitive" } } },
        { vehicle: { model: { contains: params.search, mode: "insensitive" } } },
        { vehicle: { licensePlate: { contains: params.search, mode: "insensitive" } } },
        { template: { name: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    const [records, total, statusCounts] = await Promise.all([
      db.inspection.findMany({
        where,
        include: {
          vehicle: { select: { id: true, make: true, model: true, year: true, licensePlate: true } },
          template: { select: { id: true, name: true } },
          items: { select: { id: true, condition: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      db.inspection.count({ where }),
      db.inspection.groupBy({
        by: ["status"],
        where: { organizationId },
        _count: true,
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const g of statusCounts) {
      counts[g.status] = g._count;
    }

    return {
      records,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      statusCounts: counts,
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS }] });
}

export async function getInspection(id: string) {
  return withAuth(async ({ organizationId }) => {
    const inspection = await db.inspection.findFirst({
      where: { id, organizationId },
      include: {
        vehicle: {
          select: {
            id: true, make: true, model: true, year: true, vin: true,
            licensePlate: true, mileage: true,
            customer: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
        template: { select: { id: true, name: true } },
        items: { orderBy: { sortOrder: "asc" } },
        quotes: {
          select: {
            id: true, quoteNumber: true, status: true, createdAt: true,
            user: { select: { name: true } },
          },
        },
        quoteRequests: {
          where: { status: "pending" },
          select: { id: true, message: true, selectedItemIds: true, createdAt: true },
          orderBy: { createdAt: "desc" as const },
          take: 1,
        },
      },
    });
    if (!inspection) throw new Error("Inspection not found");
    return inspection;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS }] });
}

export async function getVehicleInspections(vehicleId: string) {
  return withAuth(async ({ organizationId }) => {
    const inspections = await db.inspection.findMany({
      where: { vehicleId, organizationId },
      include: {
        template: { select: { id: true, name: true } },
        items: { select: { id: true, condition: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return inspections;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS }] });
}

export async function createInspection(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const data = createInspectionSchema.parse(input);

    // Verify vehicle belongs to org
    const vehicle = await db.vehicle.findFirst({
      where: { id: data.vehicleId, organizationId },
    });
    if (!vehicle) throw new Error("Vehicle not found");

    // Verify template belongs to org
    const template = await db.inspectionTemplate.findFirst({
      where: { id: data.templateId, organizationId },
      include: {
        sections: {
          include: { items: { orderBy: { sortOrder: "asc" } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!template) throw new Error("Template not found");

    const inspection = await db.$transaction(async (tx) => {
      const created = await tx.inspection.create({
        data: {
          vehicleId: data.vehicleId,
          templateId: data.templateId,
          mileage: data.mileage,
          technicianId: userId,
          organizationId,
        },
      });

      // Copy template items into inspection items with globally unique sortOrder
      // so sections always appear in a stable order when sorted by sortOrder
      const items = template.sections.flatMap((section, sIdx) =>
        section.items.map((item) => ({
          name: item.name,
          section: section.name,
          sortOrder: sIdx * 1000 + item.sortOrder,
          inspectionId: created.id,
        }))
      );

      if (items.length > 0) {
        await tx.inspectionItem.createMany({ data: items });
      }

      return created;
    });

    revalidatePath("/inspections");
    revalidatePath(`/vehicles/${data.vehicleId}`);
    return inspection;
  }, { requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS }] });
}

export async function updateInspectionItem(itemId: string, input: unknown) {
  return withAuth(async ({ organizationId }) => {
    const data = updateInspectionItemSchema.parse(input);

    const item = await db.inspectionItem.findFirst({
      where: { id: itemId, inspection: { organizationId } },
    });
    if (!item) throw new Error("Inspection item not found");

    const updated = await db.inspectionItem.update({
      where: { id: itemId },
      data: {
        condition: data.condition,
        notes: data.notes,
        imageUrls: data.imageUrls,
      },
    });

    return updated;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS }] });
}

export async function completeInspection(id: string) {
  return withAuth(async ({ organizationId }) => {
    const inspection = await db.inspection.findFirst({
      where: { id, organizationId },
    });
    if (!inspection) throw new Error("Inspection not found");

    await db.inspection.updateMany({
      where: { id, organizationId },
      data: { status: "completed", completedAt: new Date() },
    });

    notificationBus.emit("workboard", {
      type: "job_status_changed",
      organizationId,
      inspectionId: id,
      status: "completed",
    });

    revalidatePath("/inspections");
    revalidatePath(`/inspections/${id}`);
    revalidatePath(`/vehicles/${inspection.vehicleId}`);
    return { success: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS }] });
}

export async function deleteInspection(id: string) {
  return withAuth(async ({ organizationId }) => {
    const inspection = await db.inspection.findFirst({
      where: { id, organizationId },
      include: {
        items: { select: { id: true } },
        boardAssignments: { select: { id: true } },
      },
    });
    if (!inspection) throw new Error("Inspection not found");

    const deletions: Promise<void>[] = [recordDeletion("inspection", id, organizationId)];
    if (inspection.items.length) deletions.push(recordDeletion("inspectionItem", inspection.items.map(i => i.id), organizationId));
    if (inspection.boardAssignments.length) deletions.push(recordDeletion("boardAssignment", inspection.boardAssignments.map(b => b.id), organizationId));
    await Promise.all(deletions);

    await db.inspection.deleteMany({ where: { id, organizationId } });
    revalidatePath("/inspections");
    revalidatePath(`/vehicles/${inspection.vehicleId}`);
  }, { requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.INSPECTIONS }] });
}
