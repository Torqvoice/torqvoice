import type { Prisma } from '@/generated/prisma/client'
import { equipmentEnabled } from '@/features/equipment/Lib/equipmentGate.server'
import { equipmentSerialMatch } from '@/features/equipment/Lib/equipmentSearch'
import { fleetNumberMatch, isFleetNumberEnabled } from '@/features/vehicles/Lib/fleetNumberSetting'
import { searchYear } from '@/features/vehicles/Lib/searchYear'
import { searchWordsOf, typeKeySearchTerms } from '@/features/vehicles/Lib/typeKey'
import { isTypeKeyEnabled } from '@/features/vehicles/Lib/typeKeySetting'
import { keysetColumn, type KeysetPart } from '@/lib/keyset'

/**
 * The vehicle list's query, in one place: the page's first batch and every
 * batch loaded while scrolling are built here, so the rows that arrive later
 * are always the same list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const VEHICLE_BATCH_SIZE = 50

export type VehicleListFilters = {
  search?: string
  archived?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  /** Periodic inspection filter: overdue, or due within this many days. */
  inspectionDue?: 'overdue' | 30 | 90
}

export async function vehicleListWhere(organizationId: string, params: VehicleListFilters) {
  const where: any = { organizationId, isArchived: params.archived ?? false }

  if (params.search) {
    const words = searchWordsOf(params.search)
    const typeKeyOn = await isTypeKeyEnabled(organizationId)
    const fleetNumberOn = await isFleetNumberEnabled(organizationId)
    // A serial number of equipment on the vehicle now finds it, for a
    // workshop that records equipment; off, the query is unchanged.
    const equipmentOn = await equipmentEnabled(organizationId)
    const fieldMatch = (word: string) => {
      const conditions: any[] = [
        { make: { contains: word, mode: 'insensitive' } },
        { model: { contains: word, mode: 'insensitive' } },
        { licensePlate: { contains: word, mode: 'insensitive' } },
        { vin: { contains: word, mode: 'insensitive' } },
        ...(typeKeyOn ? typeKeySearchTerms(word) : []),
        ...fleetNumberMatch(word, fleetNumberOn),
        ...equipmentSerialMatch(organizationId, word, equipmentOn),
        { customer: { name: { contains: word, mode: 'insensitive' } } },
      ]
      const year = searchYear(word)
      if (year !== null) conditions.push({ year })
      return conditions
    }
    if (words.length > 1) {
      where.AND = words.map((word: string) => ({ OR: fieldMatch(word) }))
    } else if (words.length === 1) {
      where.OR = fieldMatch(words[0])
    }
  }

  if (params.inspectionDue) {
    const now = new Date()
    where.inspectionStatus =
      params.inspectionDue === 'overdue'
        ? { dueAt: { lt: now } }
        : { dueAt: { lt: new Date(now.getTime() + params.inspectionDue * 86_400_000) } }
  }

  return where
}

/**
 * What the list is sorted by, column by column; the id breaks the last tie
 * (lib/keyset.ts adds it).
 *
 * Null for the service count: Postgres can order by a relation's count, but
 * Prisma cannot filter on one, so there is no "rows after this count" to ask
 * for. That one sort pages by position instead (see `vehicleCountOrderBy`).
 */
export function vehicleListSort(params: {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  inspectionDue?: unknown
}): KeysetPart[] | null {
  const dir = params.sortOrder || 'desc'
  // A due-date filter reads soonest first unless a column was chosen.
  if (params.inspectionDue && !params.sortBy) {
    return [keysetColumn(['inspectionStatus', 'dueAt'], 'asc', 'date', { nullable: true })]
  }
  switch (params.sortBy) {
    case 'plate':
      return [keysetColumn(['licensePlate'], dir, 'string', { nullable: true, nulls: 'last' })]
    // The column shows "year make model" as one value; sort by make, then
    // model, then year so identical models group together.
    case 'vehicle':
      return [
        keysetColumn(['make'], dir, 'string'),
        keysetColumn(['model'], dir, 'string'),
        keysetColumn(['year'], dir, 'number'),
      ]
    case 'customer':
      return [keysetColumn(['customer', 'name'], dir, 'string')]
    case 'mileage':
      return [keysetColumn(['mileage'], dir, 'number')]
    case 'services':
      return null
    default:
      return [keysetColumn(['updatedAt'], 'desc', 'date')]
  }
}

/** The order for the service-count sort, which pages by position. */
export function vehicleCountOrderBy(
  sortOrder?: 'asc' | 'desc'
): Prisma.VehicleOrderByWithRelationInput[] {
  return [{ serviceRecords: { _count: sortOrder || 'desc' } }, { id: 'asc' }]
}

export const vehicleListInclude = {
  customer: { select: { id: true, name: true, company: true } },
  inspectionStatus: { select: { dueAt: true, source: true } },
  _count: { select: { serviceRecords: true } },
} as const
