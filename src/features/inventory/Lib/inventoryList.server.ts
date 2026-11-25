import type { Prisma } from '@/generated/prisma/client'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { db } from '@/lib/db'
import { keysetColumn, type KeysetPart } from '@/lib/keyset'
import { partIdsWithTag, partIdsWithTagContaining } from './tagSearch.server'

/**
 * The inventory list's query, in one place: the page's first batch and every
 * batch loaded while scrolling are built here, so the rows that arrive later
 * are always the same list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const INVENTORY_BATCH_SIZE = 50

/** Words of a list search looked at; the rest of a pasted paragraph is ignored. */
const MAX_SEARCH_WORDS = 8

export type InventoryListFilters = {
  search?: string
  category?: string
  /** Restrict to parts carrying this tag, in any case. */
  tag?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  /** Restrict to parts at or below their reorder point. */
  lowStock?: boolean
}

export async function inventoryListWhere(
  organizationId: string,
  params: InventoryListFilters
): Promise<Prisma.InventoryPartWhereInput> {
  const mode = 'insensitive' as Prisma.QueryMode
  const where: Prisma.InventoryPartWhereInput = { organizationId, isArchived: false }
  const and: Prisma.InventoryPartWhereInput[] = []

  // Every word has to match some field or tag, in any order, so "filter
  // hilux" finds the fuel filter tagged Hilux.
  const words = (params.search ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length > 0) {
    const searched = words.slice(0, MAX_SEARCH_WORDS)
    const tagged = await Promise.all(
      searched.map((word) => partIdsWithTagContaining(organizationId, word))
    )
    searched.forEach((word, i) => {
      and.push({
        OR: [
          { name: { contains: word, mode } },
          { partNumber: { contains: word, mode } },
          { barcode: { contains: word, mode } },
          { description: { contains: word, mode } },
          { supplier: { contains: word, mode } },
          { location: { contains: word, mode } },
          { id: { in: tagged[i] } },
        ],
      })
    })
  }

  if (params.category && params.category !== 'all') {
    where.category = params.category
  }

  if (params.tag?.trim()) {
    and.push({ id: { in: await partIdsWithTag(organizationId, params.tag) } })
  }

  if (params.lowStock) {
    // Prisma cannot compare two columns of the same row in a `where`, so the
    // matching ids are resolved in SQL first. The low-stock set is small by
    // definition (parts at or below their reorder point), so the extra query
    // stays cheap. Same rule as isLow() in Lib/lowStockAlerts and the
    // dashboard count: the part's own reorder point wins, else the org-wide
    // default.
    const thresholdRow = await db.appSetting.findFirst({
      where: { organizationId, key: SETTING_KEYS.LOW_STOCK_DEFAULT_THRESHOLD },
      select: { value: true },
    })
    const parsedDefault = Number(thresholdRow?.value)
    const lowStockDefault = Number.isFinite(parsedDefault) && parsedDefault > 0 ? parsedDefault : 0

    const lowRows = await db.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "public"."inventory_parts"
      WHERE "organizationId" = ${organizationId}
        AND "isArchived" = false
        AND "trackStock" = true
        AND COALESCE(NULLIF("minQuantity", 0), ${lowStockDefault}) > 0
        AND "quantity" <= COALESCE(NULLIF("minQuantity", 0), ${lowStockDefault})
    `
    and.push({ id: { in: lowRows.map((r) => r.id) } })
  }

  if (and.length > 0) where.AND = and
  return where
}

/** The columns the list sorts by, and what kind of value each holds. */
const SORTABLE: Record<string, { kind: 'string' | 'number' | 'date'; nullable?: boolean }> = {
  name: { kind: 'string' },
  partNumber: { kind: 'string', nullable: true },
  category: { kind: 'string', nullable: true },
  quantity: { kind: 'number' },
  unitCost: { kind: 'number' },
  sellPrice: { kind: 'number' },
  supplier: { kind: 'string', nullable: true },
  location: { kind: 'string', nullable: true },
  updatedAt: { kind: 'date' },
}

/**
 * What the list is sorted by. The id breaks the last tie (lib/keyset.ts adds
 * it). An unknown column is the last change, newest first by default.
 */
export function inventoryListSort(sortBy?: string, sortOrder?: 'asc' | 'desc'): KeysetPart[] {
  const dir = sortOrder || 'desc'
  const column = sortBy && Object.hasOwn(SORTABLE, sortBy) ? sortBy : 'updatedAt'
  const { kind, nullable } = SORTABLE[column]
  return [keysetColumn([column], dir, kind, { nullable })]
}

export const inventoryListInclude = {
  gallery: { orderBy: { sortOrder: 'asc' } },
} as const
