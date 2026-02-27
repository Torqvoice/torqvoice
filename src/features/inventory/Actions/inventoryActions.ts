"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { createInventoryPartSchema, updateInventoryPartSchema, adjustStockSchema } from "../Schema/inventorySchema";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { unlink } from "fs/promises";
import { resolveUploadPath } from "@/lib/resolve-upload-path";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getInventoryPartsPaginated(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
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
        { description: { contains: q, mode } },
        { supplier: { contains: q, mode } },
        { location: { contains: q, mode } },
      ];
    }

    if (params.category && params.category !== "all") {
      where.category = params.category;
    }

    const [parts, total] = await Promise.all([
      db.inventoryPart.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize,
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
    });
    if (!part) throw new Error("Part not found");
    return part;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.INVENTORY }] });
}

export async function createInventoryPart(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const data = createInventoryPartSchema.parse(input);
    const part = await db.inventoryPart.create({
      data: {
        ...data,
        partNumber: data.partNumber || undefined,
        description: data.description || undefined,
        category: data.category || undefined,
        supplier: data.supplier || undefined,
        supplierPhone: data.supplierPhone || undefined,
        supplierEmail: data.supplierEmail || undefined,
        supplierUrl: data.supplierUrl || undefined,
        imageUrl: data.imageUrl || undefined,
        location: data.location || undefined,
        userId,
        organizationId,
      },
    });
    revalidatePath("/inventory");
    return part;
  }, { requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.INVENTORY }] });
}

export async function updateInventoryPart(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const data = updateInventoryPartSchema.parse(input);
    const { id, ...updateData } = data;

    // If image is being changed, delete the old file
    if (updateData.imageUrl !== undefined) {
      const existing = await db.inventoryPart.findFirst({
        where: { id, organizationId },
        select: { imageUrl: true },
      });
      if (existing?.imageUrl && existing.imageUrl !== updateData.imageUrl) {
        try {
          await unlink(resolveUploadPath(existing.imageUrl));
        } catch {
          // Old file may already be gone
        }
      }
    }

    const result = await db.inventoryPart.updateMany({
      where: { id, organizationId },
      data: {
        ...updateData,
        partNumber: updateData.partNumber !== undefined ? (updateData.partNumber || null) : undefined,
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
    return { updated: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.INVENTORY }] });
}

export async function deleteInventoryPart(partId: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const part = await db.inventoryPart.findFirst({
      where: { id: partId, organizationId },
      select: { imageUrl: true },
    });

    const result = await db.inventoryPart.deleteMany({
      where: { id: partId, organizationId },
    });
    if (result.count === 0) throw new Error("Part not found");

    if (part?.imageUrl) {
      try {
        await unlink(resolveUploadPath(part.imageUrl));
      } catch {
        // File may already be gone
      }
    }

    revalidatePath("/inventory");
    return { deleted: true };
  }, { requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.INVENTORY }] });
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
        name: true,
        unitCost: true,
        sellPrice: true,
        quantity: true,
        category: true,
      },
      orderBy: { name: "asc" },
    });
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.INVENTORY }] });
}

const applyMarkupSchema = z.object({
  multiplier: z.number().positive("Multiplier must be greater than 0"),
});

export async function applyMarkupToAll(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const { multiplier } = applyMarkupSchema.parse(input);

    const parts = await db.inventoryPart.findMany({
      where: { organizationId, isArchived: false },
      select: { id: true, unitCost: true },
    });

    await db.$transaction(
      parts.map((p) =>
        db.inventoryPart.updateMany({
          where: { id: p.id, organizationId },
          data: { sellPrice: Math.round(p.unitCost * multiplier * 100) / 100 },
        })
      )
    );

    revalidatePath("/inventory");
    return { updated: parts.length };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.INVENTORY }] });
}
