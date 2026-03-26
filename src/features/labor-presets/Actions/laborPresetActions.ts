"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { createLaborPresetSchema, updateLaborPresetSchema } from "../Schema/laborPresetSchema";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getLaborPresetsPaginated(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  return withAuth(async ({ userId, organizationId }) => {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const skip = (page - 1) * pageSize;
    const mode = "insensitive" as Prisma.QueryMode;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { organizationId, isArchived: false };

    if (params.search) {
      const q = params.search.trim();
      where.OR = [
        { name: { contains: q, mode } },
        { description: { contains: q, mode } },
      ];
    }

    const dir = params.sortOrder || "desc";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderBy: any = (() => {
      switch (params.sortBy) {
        case "name": return { name: dir };
        case "description": return { description: dir };
        case "createdAt": return { createdAt: dir };
        default: return { updatedAt: dir };
      }
    })();

    const [presets, total] = await Promise.all([
      db.laborPreset.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          _count: { select: { items: true } },
          items: { select: { hours: true, pricingType: true } },
        },
      }),
      db.laborPreset.count({ where }),
    ]);

    return {
      presets,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.LABOR_PRESETS }] });
}

export async function getLaborPreset(presetId: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const preset = await db.laborPreset.findFirst({
      where: { id: presetId, organizationId },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!preset) throw new Error("Preset not found");
    return preset;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.LABOR_PRESETS }] });
}

export async function createLaborPreset(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const data = createLaborPresetSchema.parse(input);
    const resolvedName = data.name?.trim() || data.items[0]?.description || "Untitled";
    const preset = await db.laborPreset.create({
      data: {
        name: resolvedName,
        description: data.description || undefined,
        userId,
        organizationId,
        items: {
          create: data.items.map((item, index) => ({
            description: item.description,
            hours: item.hours,
            rate: item.rate,
            pricingType: item.pricingType || "hourly",
            sortOrder: index,
          })),
        },
      },
      include: { items: true },
    });
    revalidatePath("/labor-presets");
    return preset;
  }, {
    requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.LABOR_PRESETS }],
    audit: ({ result }) => ({
      action: "labor_preset.create",
      entity: "LaborPreset",
      entityId: result.id,
      message: `Created labor preset "${result.name}"`,
      metadata: { presetId: result.id },
    }),
  });
}

export async function updateLaborPreset(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const data = updateLaborPresetSchema.parse(input);
    const { id, items, ...updateData } = data;
    // Resolve name from first item if not provided
    if (updateData.name !== undefined) {
      updateData.name = updateData.name?.trim() || items?.[0]?.description || "Untitled";
    }

    await db.$transaction(async (tx) => {
      // Delete old items
      await tx.laborPresetItem.deleteMany({ where: { presetId: id } });

      // Update preset and create new items
      return tx.laborPreset.update({
        where: { id },
        data: {
          ...updateData,
          description: updateData.description !== undefined ? (updateData.description || null) : undefined,
          items: items ? {
            create: items.map((item, index) => ({
              description: item.description,
              hours: item.hours,
              rate: item.rate,
              pricingType: item.pricingType || "hourly",
              sortOrder: index,
            })),
          } : undefined,
        },
        include: { items: true },
      });
    });

    revalidatePath("/labor-presets");
    return { updated: true, presetId: id };
  }, {
    requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.LABOR_PRESETS }],
    audit: ({ result }) => ({
      action: "labor_preset.update",
      entity: "LaborPreset",
      entityId: result.presetId,
      message: `Updated labor preset ${result.presetId}`,
      metadata: { presetId: result.presetId },
    }),
  });
}

export async function deleteLaborPreset(presetId: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const result = await db.laborPreset.deleteMany({
      where: { id: presetId, organizationId },
    });
    if (result.count === 0) throw new Error("Preset not found");
    revalidatePath("/labor-presets");
    return { deleted: true, presetId };
  }, {
    requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.LABOR_PRESETS }],
    audit: ({ result }) => ({
      action: "labor_preset.delete",
      entity: "LaborPreset",
      entityId: result.presetId,
      message: `Deleted labor preset ${result.presetId}`,
      metadata: { presetId: result.presetId },
    }),
  });
}

export async function getLaborPresetsList() {
  return withAuth(async ({ userId, organizationId }) => {
    return db.laborPreset.findMany({
      where: { organizationId, isArchived: false },
      select: {
        id: true,
        name: true,
        description: true,
        items: {
          select: {
            description: true,
            hours: true,
            rate: true,
            pricingType: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.LABOR_PRESETS }] });
}
