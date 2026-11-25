import { observationStatusFilter } from '@/features/vehicles/Lib/observationFilters'
import { typeKeySearch } from '@/features/vehicles/Lib/typeKeySetting'
import { keysetColumn, type KeysetPart } from '@/lib/keyset'

/**
 * The observations list's query, in one place: the page's first batch and
 * every batch loaded while scrolling are built here, so the rows that arrive
 * later are always the same list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const OBSERVATION_BATCH_SIZE = 50

export type ObservationListFilters = {
  search?: string
  status?: string
  severity?: string
}

export async function observationListWhere(organizationId: string, params: ObservationListFilters) {
  const search = params.search?.trim()
  const mode = 'insensitive' as const
  // No status asked for means the default (open), as the dropdown shows.
  const status = observationStatusFilter(params.status)
  // A finding has no organizationId of its own; it is always a vehicle's, so
  // the workshop is checked through the vehicle.
  return {
    vehicle: { organizationId },
    ...(status !== 'all' ? { status } : {}),
    ...(params.severity && params.severity !== 'all' ? { severity: params.severity } : {}),
    ...(search
      ? {
          OR: [
            { description: { contains: search, mode } },
            { notes: { contains: search, mode } },
            { vehicle: { licensePlate: { contains: search, mode } } },
            ...(await typeKeySearch(organizationId, search)).map((vehicle) => ({ vehicle })),
            { vehicle: { make: { contains: search, mode } } },
            { vehicle: { model: { contains: search, mode } } },
          ],
        }
      : {}),
  }
}

/** Open before resolved, and the newest first within each. */
export const observationListSort: KeysetPart[] = [
  keysetColumn(['status'], 'asc', 'string'),
  keysetColumn(['createdAt'], 'desc', 'date'),
]

export const observationListInclude = {
  vehicle: {
    select: { id: true, make: true, model: true, year: true, licensePlate: true },
  },
  serviceRecord: { select: { id: true, title: true } },
  resolvedServiceRecord: { select: { id: true, title: true } },
} as const
