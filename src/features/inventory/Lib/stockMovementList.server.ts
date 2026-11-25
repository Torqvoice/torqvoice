import { formatDateTime } from '@/lib/format'
import { keysetColumn, type KeysetPart } from '@/lib/keyset'
import type { WorkshopDateSettings } from '@/lib/workshop-timezone'
import { STOCK_MOVEMENT_REASONS } from './stockMovementReasons'

/**
 * A part's stock history, in one place: the detail page's first batch and
 * every batch loaded while scrolling are built here, so the rows that arrive
 * later are always the same list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const STOCK_MOVEMENT_BATCH_SIZE = 50

export function stockMovementListWhere(
  organizationId: string,
  params: { inventoryPartId: string; reason?: string }
) {
  return {
    inventoryPartId: params.inventoryPartId,
    // Scoped by the workshop as well as the part, so a guessed part id from
    // another workshop finds nothing.
    organizationId,
    // An unrecognised reason is ignored rather than showing an empty list.
    ...(params.reason && (STOCK_MOVEMENT_REASONS as readonly string[]).includes(params.reason)
      ? { reason: params.reason }
      : {}),
  }
}

/**
 * Newest first, which matches the `(inventoryPartId, createdAt DESC)` index,
 * so every batch is an index scan however long the ledger grows.
 */
export const stockMovementListSort: KeysetPart[] = [keysetColumn(['createdAt'], 'desc', 'date')]

export const stockMovementListSelect = {
  id: true,
  delta: true,
  quantityAfter: true,
  reason: true,
  note: true,
  createdAt: true,
  serviceRecordLabel: true,
  user: { select: { name: true } },
  serviceRecord: {
    select: {
      id: true,
      title: true,
      invoiceNumber: true,
      vehicleId: true,
      vehicle: { select: { make: true, model: true, licensePlate: true } },
    },
  },
} as const

type MovementRow = {
  id: string
  delta: number
  quantityAfter: number
  reason: string
  note: string | null
  createdAt: Date
  serviceRecordLabel: string | null
  user: { name: string | null } | null
  serviceRecord: {
    id: string
    title: string
    invoiceNumber: string | null
    vehicleId: string | null
    vehicle: { make: string; model: string; licensePlate: string | null } | null
  } | null
}

/**
 * A movement as the history shows it. The time is written out here, on the
 * workshop's clock and in its format: formatted in the browser it would read
 * the server's zone while rendering and the viewer's after, and disagree.
 */
export function presentStockMovement(m: MovementRow, dates: WorkshopDateSettings) {
  const vehicle = m.serviceRecord?.vehicle
  return {
    id: m.id,
    delta: m.delta,
    quantityAfter: m.quantityAfter,
    reason: m.reason,
    note: m.note,
    createdAt: m.createdAt.toISOString(),
    createdAtLabel: formatDateTime(m.createdAt, dates.dateFormat, dates.timeFormat, dates.timeZone),
    userName: m.user?.name ?? null,
    // Present only while the job still exists; the label below outlives it.
    serviceRecordId: m.serviceRecord?.id ?? null,
    vehicleId: m.serviceRecord?.vehicleId ?? null,
    label: m.serviceRecord?.invoiceNumber || m.serviceRecord?.title || m.serviceRecordLabel || null,
    vehicle: vehicle
      ? [vehicle.make, vehicle.model, vehicle.licensePlate ? `(${vehicle.licensePlate})` : null]
          .filter(Boolean)
          .join(' ')
      : null,
  }
}

export type StockMovementListRow = ReturnType<typeof presentStockMovement>
