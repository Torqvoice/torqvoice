import type { Prisma } from '@/generated/prisma/client'
import { typeKeySearch } from '@/features/vehicles/Lib/typeKeySetting'
import { keysetColumn, type KeysetPart } from '@/lib/keyset'

/**
 * The tire hotel list's query, in one place: the page's first batch and every
 * batch loaded while scrolling are built here, so the rows that arrive later
 * are always the same list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const TIRE_SET_BATCH_SIZE = 50

export type TireSetListFilters = {
  search?: string
  status?: string
  season?: string
  warehouseId?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export async function tireSetListWhere(
  organizationId: string,
  params: TireSetListFilters
): Promise<Prisma.TireSetWhereInput> {
  const mode = 'insensitive' as Prisma.QueryMode
  const where: Prisma.TireSetWhereInput = { organizationId }

  // "needs_prep" is not a set status but a question about its work list, so
  // it filters on outstanding treatments and leaves the status alone.
  if (params.status === 'needs_prep') {
    where.treatments = { some: { status: 'pending' } }
    where.status = { not: 'disposed' }
  } else if (params.status && params.status !== 'all') {
    where.status = params.status
  } else {
    // A written-off set is history. After a few years a shop would have
    // more scrapped sets than live ones, and the default view is meant to
    // answer what is here now.
    where.status = { not: 'disposed' }
  }
  if (params.season && params.season !== 'all') where.season = params.season
  if (params.warehouseId) where.location = { warehouseId: params.warehouseId }

  if (params.search) {
    const q = params.search.trim()
    where.OR = [
      { reference: { contains: q, mode } },
      { brand: { contains: q, mode } },
      { model: { contains: q, mode } },
      { size: { contains: q, mode } },
      { dotCode: { contains: q, mode } },
      { location: { code: { contains: q, mode } } },
      { customer: { name: { contains: q, mode } } },
      { vehicle: { licensePlate: { contains: q, mode } } },
      ...(await typeKeySearch(organizationId, q)).map((vehicle) => ({ vehicle })),
      { vehicle: { make: { contains: q, mode } } },
      { vehicle: { model: { contains: q, mode } } },
    ]
  }

  return where
}

/**
 * What the list is sorted by, column by column. The id breaks the last tie
 * (lib/keyset.ts adds it).
 */
export function tireSetListSort(sortBy?: string, sortOrder?: 'asc' | 'desc'): KeysetPart[] {
  const dir = sortOrder || 'desc'
  switch (sortBy) {
    case 'reference':
      return [keysetColumn(['reference'], dir, 'string', { nullable: true })]
    case 'season':
      return [keysetColumn(['season'], dir, 'string')]
    case 'status':
      return [keysetColumn(['status'], dir, 'string')]
    case 'checkedInAt':
      return [keysetColumn(['checkedInAt'], dir, 'date', { nullable: true })]
    case 'customer':
      return [keysetColumn(['customer', 'name'], dir, 'string')]
    default:
      return [keysetColumn(['updatedAt'], dir, 'date')]
  }
}

export const tireSetListInclude = {
  location: {
    select: { id: true, code: true, warehouse: { select: { id: true, name: true } } },
  },
  vehicle: {
    select: { id: true, make: true, model: true, year: true, licensePlate: true },
  },
  customer: { select: { id: true, name: true, phone: true } },
  measurements: {
    orderBy: { measuredAt: 'desc' },
    take: 8,
    select: { condition: true, treadDepthMm: true, position: true, measuredAt: true },
  },
  treatments: { select: { type: true, status: true } },
} as const satisfies Prisma.TireSetInclude
