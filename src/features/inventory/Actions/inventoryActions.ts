"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { createInventoryPartSchema, updateInventoryPartSchema, adjustStockSchema } from "../Schema/inventorySchema";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { unlink } from "fs/promises";
import { resolveUploadPath } from "@/lib/resolve-upload-path";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getInventoryPartsPaginated(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
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
        { partNumber: { contains: q, mode } },
        { barcode: { contains: q, mode } },
        { description: { contains: q, mode } },
        { supplier: { contains: q, mode } },
        { location: { contains: q, mode } },
      ];
    }

    if (params.category && params.category !== "all") {
      where.category = params.category;
    }

    const dir = params.sortOrder || "desc";
    const sortableColumns = ["name", "partNumber", "category", "quantity", "unitCost", "sellPrice", "supplier", "location", "updatedAt"];
    const sortColumn = params.sortBy && sortableColumns.includes(params.sortBy) ? params.sortBy : "updatedAt";

    const [parts, total] = await Promise.all([
      db.inventoryPart.findMany({
        where,
        orderBy: { [sortColumn]: dir },
        skip,
        take: pageSize,
        include: { gallery: { orderBy: { sortOrder: "asc" } } },
      }),
      db.inventoryPart.count({ where }),
    ]);

    return {
      parts,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.INVENTORY }] });
}

export async function getInventoryPart(partId: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const part = await db.inventoryPart.findFirst({
      where: { id: partId, organizationId },
      include: { gallery: { orderBy: { sortOrder: "asc" } } },
    });
    if (!part) throw new Error("Part not found");
    return part;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.INVENTORY }] });
}

export async function createInventoryPart(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const data = createInventoryPartSchema.parse(input);
    const { gallery, ...rest } = data;
    const part = await db.inventoryPart.create({
      data: {
        ...rest,
        partNumber: rest.partNumber || undefined,
        barcode: rest.barcode || undefined,
        description: rest.description || undefined,
        category: rest.category || undefined,
        supplier: rest.supplier || undefined,
        supplierPhone: rest.supplierPhone || undefined,
        supplierEmail: rest.supplierEmail || undefined,
        supplierUrl: rest.supplierUrl || undefined,
        imageUrl: gallery?.[0]?.url || undefined,
        location: rest.location || undefined,
        userId,
        organizationId,
      },
    });

    if (gallery && gallery.length > 0) {
      await db.storedImage.createMany({
        data: gallery.map((img, i) => ({
          url: img.url,
          fileName: img.fileName || null,
          description: img.description || null,
          sortOrder: i,
          inventoryPartId: part.id,
        })),
      });
    }

    revalidatePath("/inventory");
    return part;
  }, {
    requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.INVENTORY }],
    audit: ({ result }) => ({
      action: "inventory.create",
      entity: "InventoryPart",
      entityId: result.id,
      message: `Created inventory part "${result.name}"`,
      metadata: { partId: result.id },
    }),
  });
}

export async function updateInventoryPart(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const data = updateInventoryPartSchema.parse(input);
    const { id, gallery: galleryData, ...updateData } = data;

    // Handle gallery updates
    if (galleryData !== undefined) {
      // Clean up old files that are no longer in the gallery
      const existingImages = await db.storedImage.findMany({ where: { inventoryPartId: id } });
      const newUrls = new Set(galleryData.map(g => g.url));
      for (const old of existingImages) {
        if (!newUrls.has(old.url)) {
          try { await unlink(resolveUploadPath(old.url)); } catch { /* already gone */ }
        }
      }
      // Replace all gallery records
      await db.storedImage.deleteMany({ where: { inventoryPartId: id } });
      if (galleryData.length > 0) {
        await db.storedImage.createMany({
          data: galleryData.map((img, i) => ({
            url: img.url,
            fileName: img.fileName || null,
            description: img.description || null,
            sortOrder: i,
            inventoryPartId: id,
          })),
        });
      }
      // Update imageUrl for backward compat
      await db.inventoryPart.updateMany({
        where: { id, organizationId },
        data: { imageUrl: galleryData[0]?.url || null },
      });
    }

    const result = await db.inventoryPart.updateMany({
      where: { id, organizationId },
      data: {
        ...updateData,
        partNumber: updateData.partNumber !== undefined ? (updateData.partNumber || null) : undefined,
        barcode: updateData.barcode !== undefined ? (updateData.barcode || null) : undefined,
        description: updateData.description !== undefined ? (updateData.description || null) : undefined,
        category: updateData.category !== undefined ? (updateData.category || null) : undefined,
        supplier: updateData.supplier !== undefined ? (updateData.supplier || null) : undefined,
        supplierPhone: updateData.supplierPhone !== undefined ? (updateData.supplierPhone || null) : undefined,
        supplierEmail: updateData.supplierEmail !== undefined ? (updateData.supplierEmail || null) : undefined,
        supplierUrl: updateData.supplierUrl !== undefined ? (updateData.supplierUrl || null) : undefined,
        location: updateData.location !== undefined ? (updateData.location || null) : undefined,
      },
    });
    if (result.count === 0) throw new Error("Part not found");
    revalidatePath("/inventory");
    return { updated: true, partId: id };
  }, {
    requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.INVENTORY }],
    audit: ({ result }) => ({
      action: "inventory.update",
      entity: "InventoryPart",
      entityId: result.partId,
      message: `Updated inventory part ${result.partId}`,
      metadata: { partId: result.partId },
    }),
  });
}

export async function deleteInventoryPart(partId: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const part = await db.inventoryPart.findFirst({
      where: { id: partId, organizationId },
      select: { imageUrl: true, gallery: { select: { url: true } } },
    });

    const result = await db.inventoryPart.deleteMany({
      where: { id: partId, organizationId },
    });
    if (result.count === 0) throw new Error("Part not found");

    if (part) {
      const allUrls = [
        part.imageUrl,
        ...part.gallery.map(g => g.url),
      ].filter(Boolean) as string[];
      // Deduplicate URLs before deleting files
      const uniqueUrls = [...new Set(allUrls)];
      for (const url of uniqueUrls) {
        try { await unlink(resolveUploadPath(url)); } catch { /* already gone */ }
      }
    }

    revalidatePath("/inventory");
    return { deleted: true, partId };
  }, {
    requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.INVENTORY }],
    audit: ({ result }) => ({
      action: "inventory.delete",
      entity: "InventoryPart",
      entityId: result.partId,
      message: `Deleted inventory part ${result.partId}`,
      metadata: { partId: result.partId },
    }),
  });
}

export async function deleteInventoryParts(partIds: string[]) {
  return withAuth(async ({ userId, organizationId }) => {
    if (partIds.length === 0) throw new Error("No parts selected");

    // Gather image URLs before deleting
    const parts = await db.inventoryPart.findMany({
      where: { id: { in: partIds }, organizationId },
      select: { imageUrl: true, gallery: { select: { url: true } } },
    });

    const result = await db.inventoryPart.deleteMany({
      where: { id: { in: partIds }, organizationId },
    });

    // Clean up associated image files
    const allUrls = parts.flatMap(part => [
      part.imageUrl,
      ...part.gallery.map(g => g.url),
    ]).filter(Boolean) as string[];
    const uniqueUrls = [...new Set(allUrls)];
    for (const url of uniqueUrls) {
      try { await unlink(resolveUploadPath(url)); } catch { /* already gone */ }
    }

    revalidatePath("/inventory");
    return { deleted: result.count };
  }, {
    requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.INVENTORY }],
    audit: ({ result }) => ({
      action: "inventory.bulkDelete",
      entity: "InventoryPart",
      entityId: partIds.join(","),
      message: `Bulk deleted ${result.deleted} inventory parts`,
      metadata: { partIds, deleted: result.deleted },
    }),
  });
}

export async function adjustInventoryStock(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const { id, adjustment } = adjustStockSchema.parse(input);
    const part = await db.inventoryPart.findFirst({
      where: { id, organizationId },
    });
    if (!part) throw new Error("Part not found");

    const newQuantity = part.quantity + adjustment;
    if (newQuantity < 0) throw new Error("Insufficient stock");

    await db.inventoryPart.updateMany({
      where: { id, organizationId },
      data: { quantity: newQuantity },
    });
    revalidatePath("/inventory");
    return { quantity: newQuantity };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.INVENTORY }] });
}

export async function getInventoryCategories() {
  return withAuth(async ({ userId, organizationId }) => {
    const results = await db.inventoryPart.findMany({
      where: { organizationId, category: { not: null }, isArchived: false },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });
    return results.map((r) => r.category).filter(Boolean) as string[];
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.INVENTORY }] });
}

export async function getInventoryPartsList() {
  return withAuth(async ({ userId, organizationId }) => {
    return db.inventoryPart.findMany({
      where: { organizationId, isArchived: false, quantity: { gt: 0 } },
      select: {
        id: true,
        partNumber: true,
        barcode: true,
        name: true,
        description: true,
        unitCost: true,
        sellPrice: true,
        quantity: true,
        category: true,
        gallery: { select: { id: true, url: true, sortOrder: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { name: "asc" },
    });
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.INVENTORY }] });
}

const applyMarkupSchema = z.object({
  multiplier: z.number().positive("Multiplier must be greater than 0"),
  overrideExisting: z.boolean().default(false),
});

export async function applyMarkupToAll(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const { multiplier, overrideExisting } = applyMarkupSchema.parse(input);

    // Use raw SQL to avoid Prisma's @updatedAt auto-update which changes sort order
    const result = await db.$executeRaw`
      UPDATE "inventory_parts"
      SET "sellPrice" = ROUND(("unitCost" * ${multiplier})::numeric, 2)
      WHERE "organizationId" = ${organizationId}
        AND "isArchived" = false
        ${overrideExisting ? Prisma.sql`` : Prisma.sql`AND ("sellPrice" = 0 OR "sellPrice" IS NULL)`}
    `;

    revalidatePath("/inventory");
    return { updated: result };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.INVENTORY }] });
}

export async function deleteOrphanedUploads(fileUrls: string[]) {
  return withAuth(async ({ organizationId }) => {
    for (const url of fileUrls) {
      // Only allow deleting files belonging to this org's inventory folder
      if (!url.includes(`/${organizationId}/inventory/`)) continue;
      try {
        await unlink(resolveUploadPath(url));
      } catch {
        // File may already be gone — ignore
      }
    }
    return { success: true };
  });
}
