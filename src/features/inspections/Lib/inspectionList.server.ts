import { typeKeySearch } from '@/features/vehicles/Lib/typeKeySetting'
import { keysetColumn, type KeysetPart } from '@/lib/keyset'

/**
 * The inspection list's query, in one place: the page's first batch and every
 * batch loaded while scrolling are built here, so the rows that arrive later
 * are always the same list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const INSPECTION_BATCH_SIZE = 50

export type InspectionListFilters = {
  search?: string
  status?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export async function inspectionListWhere(organizationId: string, params: InspectionListFilters) {
  const where: any = { organizationId }

  if (params.status && params.status !== 'all') {
    where.status = params.status
  }

  if (params.search) {
    where.OR = [
      { vehicle: { make: { contains: params.search, mode: 'insensitive' } } },
      { vehicle: { model: { contains: params.search, mode: 'insensitive' } } },
      { vehicle: { licensePlate: { contains: params.search, mode: 'insensitive' } } },
      ...(await typeKeySearch(organizationId, params.search)).map((vehicle) => ({ vehicle })),
      { template: { name: { contains: params.search, mode: 'insensitive' } } },
    ]
  }

  return where
}

/**
 * What the list is sorted by, column by column. The id breaks the last tie
 * (lib/keyset.ts adds it). Every inspection has a vehicle and a template.
 */
export function inspectionListSort(sortBy?: string, sortOrder?: 'asc' | 'desc'): KeysetPart[] {
  const dir = sortOrder || 'desc'
  switch (sortBy) {
    // Column shows "year make model"; sort make, model, year so identical
    // models group together.
    case 'vehicle':
      return [
        keysetColumn(['vehicle', 'make'], dir, 'string', { required: true }),
        keysetColumn(['vehicle', 'model'], dir, 'string', { required: true }),
        keysetColumn(['vehicle', 'year'], dir, 'number', { required: true }),
      ]
    case 'template':
      return [keysetColumn(['template', 'name'], dir, 'string', { required: true })]
    case 'status':
      return [keysetColumn(['status'], dir, 'string')]
    case 'createdAt':
      return [keysetColumn(['createdAt'], dir, 'date')]
    default:
      return [keysetColumn(['createdAt'], 'desc', 'date')]
  }
}

export const inspectionListInclude = {
  vehicle: {
    select: { id: true, make: true, model: true, year: true, licensePlate: true },
  },
  template: { select: { id: true, name: true, severityScale: true } },
  items: { select: { id: true, condition: true } },
} as const
