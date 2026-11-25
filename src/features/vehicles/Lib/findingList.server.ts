import { keysetColumn, type KeysetPart } from '@/lib/keyset'

/**
 * A vehicle's observations, as its Findings tab lists them: the page's first
 * batch and every batch loaded while scrolling are built here, so the rows
 * that arrive later always continue the list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const FINDING_BATCH_SIZE = 50

/** The vehicle's observations, and only while the vehicle is this workshop's. */
export function findingListWhere(organizationId: string, vehicleId: string) {
  return { vehicleId, vehicle: { organizationId } }
}

/** Open ones first, then newest first; the id breaks the last tie (lib/keyset.ts). */
export function findingListSort(): KeysetPart[] {
  return [keysetColumn(['status'], 'asc', 'string'), keysetColumn(['createdAt'], 'desc', 'date')]
}

export const findingListInclude = {
  serviceRecord: { select: { id: true, title: true } },
  resolvedServiceRecord: { select: { id: true, title: true } },
} as const
