import { keysetColumn, type KeysetPart } from '@/lib/keyset'

/**
 * A vehicle's work orders, as the classic vehicle page's Services tab lists
 * them: the page's first batch and every batch loaded while scrolling are
 * built here, so the rows that arrive later always continue the list the
 * page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const VEHICLE_SERVICE_BATCH_SIZE = 50

export type VehicleServiceListFilters = {
  search?: string
  /** maintenance, repair, upgrade, inspection; 'all' or nothing for every kind. */
  type?: string
}

export function vehicleServiceListWhere(
  organizationId: string,
  vehicleId: string,
  params: VehicleServiceListFilters
) {
  const where: any = { vehicleId, organizationId }

  if (params.search) {
    where.OR = [
      { title: { contains: params.search, mode: 'insensitive' } },
      { description: { contains: params.search, mode: 'insensitive' } },
      { concerns: { some: { description: { contains: params.search, mode: 'insensitive' } } } },
      { diagnosticNotes: { contains: params.search, mode: 'insensitive' } },
      { techName: { contains: params.search, mode: 'insensitive' } },
      { shopName: { contains: params.search, mode: 'insensitive' } },
    ]
  }

  if (params.type && params.type !== 'all') {
    where.type = params.type
  }

  return where
}

/**
 * Newest first by the date the job is presented with: the scheduled start
 * when there is one, else the service date. Jobs without a start (imported,
 * older) come last. The id breaks the last tie (lib/keyset.ts).
 */
export function vehicleServiceListSort(): KeysetPart[] {
  return [
    keysetColumn(['startDateTime'], 'desc', 'date', { nullable: true, nulls: 'last' }),
    keysetColumn(['serviceDate'], 'desc', 'date'),
  ]
}

export const vehicleServiceListInclude = {
  _count: { select: { partItems: true, laborItems: true, attachments: true } },
  // The first few lines of each job, so the list can say what was done
  // without anybody opening the job.
  laborItems: { take: 4, select: { description: true } },
  partItems: { take: 4, select: { name: true } },
  // The workshop's own status, drawn beside the stage.
  customStatus: { select: { name: true, color: true } },
} as const
