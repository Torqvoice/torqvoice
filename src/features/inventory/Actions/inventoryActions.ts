'use server'

import { db } from '@/lib/db'
import { assertOwnUploads } from '@/lib/upload-url'
import { withAuth } from '@/lib/with-auth'
import {
  createInventoryPartSchema,
  updateInventoryPartSchema,
  adjustStockSchema,
} from '../Schema/inventorySchema'
import { onInventoryChanged } from '../Lib/onInventoryChanged'
import { Prisma } from '@/generated/prisma/client'
import { z } from 'zod'
import { releaseFiles, parseStoredFileUrl } from '@/lib/files/manager'
import { inventoryPartFileUrls } from '@/lib/files/collect'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { normalizeBarcode, withBarcodeConflictMessage } from '../Lib/barcode'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

export async function getInventoryPartsPaginated(params: {
  page?: number
  pageSize?: number
  search?: string
  category?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  /** Restrict to parts at or below their reorder point. */
  lowStock?: boolean
}) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const page = params.page || 1
      const pageSize = params.pageSize || 20
      const skip = (page - 1) * pageSize
      const mode = 'insensitive' as Prisma.QueryMode

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { organizationId, isArchived: false }

      if (params.search) {
        const q = params.search.trim()
        where.OR = [
          { name: { contains: q, mode } },
          { partNumber: { contains: q, mode } },
          { barcode: { contains: q, mode } },
          { description: { contains: q, mode } },
          { supplier: { contains: q, mode } },
          { location: { contains: q, mode } },
        ]
      }

      if (params.category && params.category !== 'all') {
        where.category = params.category
      }

      if (params.lowStock) {
        // Prisma cannot compare two columns of the same row in a `where`, so the
        // matching ids are resolved in SQL first. The low-stock set is small by
        // definition (parts at or below their reorder point), so the extra query
        // stays cheap and pagination/sorting below is unaffected.
        // Same rule as isLow() in Lib/lowStockAlerts and the dashboard count:
        // the part's own reorder point wins, else the org-wide default.
        const thresholdRow = await db.appSetting.findFirst({
          where: { organizationId, key: SETTING_KEYS.LOW_STOCK_DEFAULT_THRESHOLD },
          select: { value: true },
        })
        const parsedDefault = Number(thresholdRow?.value)
        const lowStockDefault =
          Number.isFinite(parsedDefault) && parsedDefault > 0 ? parsedDefault : 0

        const lowRows = await db.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "public"."inventory_parts"
        WHERE "organizationId" = ${organizationId}
          AND "isArchived" = false
          AND COALESCE(NULLIF("minQuantity", 0), ${lowStockDefault}) > 0
          AND "quantity" <= COALESCE(NULLIF("minQuantity", 0), ${lowStockDefault})
      `
        where.id = { in: lowRows.map((r) => r.id) }
      }

      const dir = params.sortOrder || 'desc'
      const sortableColumns = [
        'name',
        'partNumber',
        'category',
        'quantity',
        'unitCost',
        'sellPrice',
        'supplier',
        'location',
        'updatedAt',
      ]
      const sortColumn =
        params.sortBy && sortableColumns.includes(params.sortBy) ? params.sortBy : 'updatedAt'

      const [parts, total] = await Promise.all([
        db.inventoryPart.findMany({
          where,
          orderBy: { [sortColumn]: dir },
          skip,
          take: pageSize,
          include: { gallery: { orderBy: { sortOrder: 'asc' } } },
        }),
        db.inventoryPart.count({ where }),
      ])

      return {
        parts,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INVENTORY },
      ],
    }
  )
}

export async function getInventoryPart(partId: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const part = await db.inventoryPart.findFirst({
        where: { id: partId, organizationId },
        include: { gallery: { orderBy: { sortOrder: 'asc' } } },
      })
      if (!part) throw new Error('Part not found')
      return part
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INVENTORY },
      ],
    }
  )
}

export async function createInventoryPart(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const data = createInventoryPartSchema.parse(input)
      assertOwnUploads(data, organizationId)
      const { gallery, ...rest } = data
      const barcode = normalizeBarcode(rest.barcode)
      const part = await withBarcodeConflictMessage(organizationId, barcode, () =>
        db.inventoryPart.create({
          data: {
            ...rest,
            partNumber: rest.partNumber || undefined,
            unit: rest.unit?.trim() || undefined,
            barcode: barcode ?? undefined,
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
        })
      )

      if (gallery && gallery.length > 0) {
        await db.storedImage.createMany({
          data: gallery.map((img, i) => ({
            url: img.url,
            fileName: img.fileName || null,
            description: img.description || null,
            sortOrder: i,
            inventoryPartId: part.id,
          })),
        })
      }

      await onInventoryChanged(organizationId)
      return part
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.INVENTORY },
      ],
      audit: ({ result }) => ({
        action: 'inventory.create',
        entity: 'InventoryPart',
        entityId: result.id,
        details: { key: 'inventory_create', params: { name: result.name } },
        metadata: { partId: result.id },
      }),
    }
  )
}

export async function updateInventoryPart(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const data = updateInventoryPartSchema.parse(input)
      assertOwnUploads(data, organizationId)
      const { id, gallery: galleryData, ...updateData } = data

      // The part has to be this workshop's before its gallery is touched: the
      // gallery rows are keyed by the part alone.
      const owned = await db.inventoryPart.findFirst({
        where: { id, organizationId },
        select: { id: true },
      })
      if (!owned) throw new Error('Part not found')

      // The images the part had before a change to them, let go at the end
      // once nothing uses them (the new gallery keeps the ones it still has).
      const replacedImages =
        galleryData !== undefined || 'imageUrl' in updateData
          ? await inventoryPartFileUrls(organizationId, [id])
          : []

      // Handle gallery updates
      if (galleryData !== undefined) {
        // Replace all gallery records, and the main image with the first, in
        // one transaction: never a moment where the part has no images and a
        // cleanup elsewhere would take them for unused.
        await db.$transaction([
          db.storedImage.deleteMany({ where: { inventoryPartId: id } }),
          ...(galleryData.length > 0
            ? [
                db.storedImage.createMany({
                  data: galleryData.map((img, i) => ({
                    url: img.url,
                    fileName: img.fileName || null,
                    description: img.description || null,
                    sortOrder: i,
                    inventoryPartId: id,
                  })),
                }),
              ]
            : []),
          // Update imageUrl for backward compat
          db.inventoryPart.updateMany({
            where: { id, organizationId },
            data: { imageUrl: galleryData[0]?.url || null },
          }),
        ])
      }

      const nextBarcode =
        updateData.barcode !== undefined ? normalizeBarcode(updateData.barcode) : undefined
      const result = await withBarcodeConflictMessage(organizationId, nextBarcode ?? null, () =>
        db.inventoryPart.updateMany({
          where: { id, organizationId },
          data: {
            ...updateData,
            partNumber:
              updateData.partNumber !== undefined ? updateData.partNumber || null : undefined,
            unit: updateData.unit !== undefined ? updateData.unit.trim() || null : undefined,
            barcode: nextBarcode,
            description:
              updateData.description !== undefined ? updateData.description || null : undefined,
            category: updateData.category !== undefined ? updateData.category || null : undefined,
            supplier: updateData.supplier !== undefined ? updateData.supplier || null : undefined,
            supplierPhone:
              updateData.supplierPhone !== undefined ? updateData.supplierPhone || null : undefined,
            supplierEmail:
              updateData.supplierEmail !== undefined ? updateData.supplierEmail || null : undefined,
            supplierUrl:
              updateData.supplierUrl !== undefined ? updateData.supplierUrl || null : undefined,
            location: updateData.location !== undefined ? updateData.location || null : undefined,
          },
        })
      )
      if (result.count === 0) throw new Error('Part not found')
      await releaseFiles(replacedImages, { organizationId, reason: 'inventory images replaced' })
      await onInventoryChanged(organizationId)
      return { updated: true, partId: id }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.INVENTORY },
      ],
      audit: ({ result }) => ({
        action: 'inventory.update',
        entity: 'InventoryPart',
        entityId: result.partId,
        details: { key: 'inventory_update', params: { id: result.partId } },
        metadata: { partId: result.partId },
      }),
    }
  )
}

export async function deleteInventoryPart(partId: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const files = await inventoryPartFileUrls(organizationId, [partId])

      const result = await db.inventoryPart.deleteMany({
        where: { id: partId, organizationId },
      })
      if (result.count === 0) throw new Error('Part not found')
      await releaseFiles(files, { organizationId, reason: 'inventory part deleted' })

      await onInventoryChanged(organizationId)
      return { deleted: true, partId }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.INVENTORY },
      ],
      audit: ({ result }) => ({
        action: 'inventory.delete',
        entity: 'InventoryPart',
        entityId: result.partId,
        details: { key: 'inventory_delete', params: { id: result.partId } },
        metadata: { partId: result.partId },
      }),
    }
  )
}

export async function deleteInventoryParts(partIds: string[]) {
  return withAuth(
    async ({ userId, organizationId }) => {
      if (partIds.length === 0) throw new Error('No parts selected')

      const files = await inventoryPartFileUrls(organizationId, partIds)

      const result = await db.inventoryPart.deleteMany({
        where: { id: { in: partIds }, organizationId },
      })
      await releaseFiles(files, { organizationId, reason: 'inventory parts deleted' })

      await onInventoryChanged(organizationId)
      return { deleted: result.count }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.INVENTORY },
      ],
      audit: ({ result }) => ({
        action: 'inventory.bulkDelete',
        entity: 'InventoryPart',
        entityId: partIds.join(','),
        details: { key: 'inventory_bulkDelete', params: { count: result.deleted } },
        metadata: { partIds, deleted: result.deleted },
      }),
    }
  )
}

export async function adjustInventoryStock(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const { id, adjustment } = adjustStockSchema.parse(input)
      const part = await db.inventoryPart.findFirst({
        where: { id, organizationId },
      })
      if (!part) throw new Error('Part not found')

      const newQuantity = part.quantity + adjustment
      if (newQuantity < 0) throw new Error('Insufficient stock')

      await db.inventoryPart.updateMany({
        where: { id, organizationId },
        data: { quantity: newQuantity },
      })
      await onInventoryChanged(organizationId)
      return { quantity: newQuantity }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.INVENTORY },
      ],
    }
  )
}

export async function getInventoryCategories() {
  return withAuth(
    async ({ userId, organizationId }) => {
      const results = await db.inventoryPart.findMany({
        where: { organizationId, category: { not: null }, isArchived: false },
        select: { category: true },
        distinct: ['category'],
        orderBy: { category: 'asc' },
      })
      return results.map((r) => r.category).filter(Boolean) as string[]
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INVENTORY },
      ],
    }
  )
}

export async function getInventoryPartsList() {
  return withAuth(
    async ({ userId, organizationId }) => {
      // Include out-of-stock and backordered (negative) parts too — the picker
      // shows their stock state so a part can still be added to a work order
      // when depleted (which then correctly drives stock negative / backorder).
      return db.inventoryPart.findMany({
        where: { organizationId, isArchived: false },
        select: {
          id: true,
          partNumber: true,
          barcode: true,
          name: true,
          description: true,
          unit: true,
          unitCost: true,
          sellPrice: true,
          quantity: true,
          category: true,
          gallery: {
            select: { id: true, url: true, sortOrder: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      })
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INVENTORY },
      ],
    }
  )
}

const applyMarkupSchema = z.object({
  multiplier: z.number().positive('Multiplier must be greater than 0'),
  overrideExisting: z.boolean().default(false),
})

export async function applyMarkupToAll(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const { multiplier, overrideExisting } = applyMarkupSchema.parse(input)

      // Use raw SQL to avoid Prisma's @updatedAt auto-update which changes sort order
      const result = await db.$executeRaw`
      UPDATE "public"."inventory_parts"
      SET "sellPrice" = ROUND(("unitCost" * ${multiplier})::numeric, 2)
      WHERE "organizationId" = ${organizationId}
        AND "isArchived" = false
        ${overrideExisting ? Prisma.sql`` : Prisma.sql`AND ("sellPrice" = 0 OR "sellPrice" IS NULL)`}
    `

      await onInventoryChanged(organizationId)
      return { updated: result }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.INVENTORY },
      ],
    }
  )
}

/**
 * Images uploaded on the part form and then abandoned (the form was
 * cancelled). Only this workshop's inventory images, and only those no row
 * uses: the file manager checks both, so a URL naming another workshop, a
 * saved part's image or a path with `..` in it is left alone.
 */
export async function deleteOrphanedUploads(fileUrls: string[]) {
  return withAuth(async ({ organizationId }) => {
    const inventoryOnly = (Array.isArray(fileUrls) ? fileUrls : []).filter(
      (url) => parseStoredFileUrl(url)?.folder === 'inventory'
    )
    await releaseFiles(inventoryOnly, { organizationId, reason: 'abandoned inventory uploads' })
    return { success: true }
  })
}

/**
 * Whether low-stock tracking can produce results at all: either the org has a
 * default reorder point, or at least one part defines its own.
 *
 * Used to tell "nothing is low right now" apart from "nothing is being
 * watched", so the Low filter can explain an empty result instead of just
 * showing a blank table.
 */
export async function hasAnyReorderPoint() {
  return withAuth(
    async ({ organizationId }) => {
      const setting = await db.appSetting.findFirst({
        where: { organizationId, key: SETTING_KEYS.LOW_STOCK_DEFAULT_THRESHOLD },
        select: { value: true },
      })
      if ((Number(setting?.value) || 0) > 0) return true

      const configured = await db.inventoryPart.count({
        where: { organizationId, isArchived: false, minQuantity: { gt: 0 } },
      })
      return configured > 0
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INVENTORY },
      ],
    }
  )
}
