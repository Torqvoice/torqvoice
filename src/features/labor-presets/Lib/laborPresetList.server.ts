import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { keysetColumn, type KeysetPart } from '@/lib/keyset'

/**
 * The labor packages list's query, in one place: the page's first batch and
 * every batch loaded while scrolling are built here, so the rows that arrive
 * later always continue the list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const LABOR_PRESET_BATCH_SIZE = 50

export function laborPresetListWhere(organizationId: string, search?: string) {
  const where: Prisma.LaborPresetWhereInput = { organizationId, isArchived: false }
  const q = search?.trim()
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ]
  }
  return where
}

/** What the list is sorted by. The id breaks the last tie (lib/keyset.ts adds it). */
export function laborPresetListSort(sortBy?: string, sortOrder?: 'asc' | 'desc'): KeysetPart[] {
  const dir = sortOrder || 'desc'
  switch (sortBy) {
    case 'name':
      return [keysetColumn(['name'], dir, 'string')]
    case 'description':
      return [keysetColumn(['description'], dir, 'string', { nullable: true })]
    case 'createdAt':
      return [keysetColumn(['createdAt'], dir, 'date')]
    default:
      return [keysetColumn(['updatedAt'], dir, 'date')]
  }
}

export const laborPresetListInclude = {
  _count: { select: { items: true, parts: true } },
  items: { select: { hours: true, pricingType: true } },
} as const
