import type { Prisma } from '@/generated/prisma/client'

/**
 * A part line that may be linked to an inventory item. Only lines with a
 * non-null `inventoryPartId` move stock; free-text parts are ignored.
 */
export interface StockPartLine {
  inventoryPartId?: string | null
  quantity: number
}

/**
 * Why stock moved. Persisted verbatim in `StockMovement.reason`, so these
 * values are part of the stored data contract — add new ones rather than
 * renaming existing ones.
 */
export type StockMovementReason =
  | 'service_record'
  | 'service_record_deleted'
  | 'quote_conversion'
  | 'manual_adjustment'
  | 'bulk_markup'

/**
 * Provenance recorded alongside every movement, so the ledger can answer
 * "where was this part used, and who did it?".
 */
export interface StockMovementContext {
  reason: StockMovementReason
  userId?: string | null
  /** The job the parts were used on, when there is one. */
  serviceRecordId?: string | null
  /**
   * Human-readable job label, denormalised so history stays meaningful after
   * the service record is deleted and `serviceRecordId` is nulled out.
   */
  serviceRecordLabel?: string | null
  note?: string | null
}

/**
 * Normalise a part quantity before it enters the stock ledger.
 *
 * Quantities are fractional (0.5 l of oil, 250 g of grease), so no whole-unit
 * rounding happens here. Values are clamped to 3 decimals instead: that is
 * precise enough for ml/g while stopping float noise (0.1 + 0.2) from
 * accumulating drift in `quantity = quantity - delta` over many movements.
 * Rounding is applied identically to the previous and next sets, so any delta
 * stays internally consistent across create / edit / delete.
 */
function stockUnits(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0
  return Math.round(quantity * 1000) / 1000
}

/**
 * Apply the net inventory movement for a service record whose linked parts
 * change from `previous` to `next`, and record each movement in the ledger.
 *
 * Semantics:
 *   - A part present in `next` but not `previous` (or with a larger quantity)
 *     consumes stock → decrement.
 *   - A part removed or reduced restocks → increment.
 *   - Unchanged quantities produce a zero delta and touch nothing.
 *
 * The movement is computed per `inventoryPartId` as the sum of `next`
 * quantities minus the sum of `previous` quantities, then applied with a single
 * atomic `UPDATE ... RETURNING` per part. Reading the balance back from
 * RETURNING (rather than a separate SELECT) keeps the write atomic while still
 * yielding an exact `quantityAfter` for the ledger — concurrent requests can
 * neither lose an update nor record a stale balance.
 *
 * Every write is scoped to `organizationId`, so a stale or cross-organization
 * `inventoryPartId` simply matches no rows, records no movement, and is
 * skipped — it can never mutate another tenant's inventory.
 *
 * Stock is allowed to go negative: over-consuming is real information
 * ("you used more than you had on hand") and, crucially, keeps the operation
 * reversible. Clamping at zero would corrupt the count as soon as the part is
 * later removed or the record deleted.
 *
 * MUST be called inside a transaction so the stock movement, the ledger rows,
 * and the ServicePart changes that caused them all commit or roll back
 * together.
 */
export async function reconcileInventoryForParts(
  tx: Prisma.TransactionClient,
  organizationId: string,
  previous: readonly StockPartLine[],
  next: readonly StockPartLine[],
  context: StockMovementContext
): Promise<void> {
  // inventoryPartId -> net units to DECREMENT (negative = restock)
  const netDecrement = new Map<string, number>()

  for (const line of previous) {
    if (!line.inventoryPartId) continue
    const current = netDecrement.get(line.inventoryPartId) ?? 0
    netDecrement.set(line.inventoryPartId, current - stockUnits(line.quantity))
  }
  for (const line of next) {
    if (!line.inventoryPartId) continue
    const current = netDecrement.get(line.inventoryPartId) ?? 0
    netDecrement.set(line.inventoryPartId, current + stockUnits(line.quantity))
  }

  const ledgerRows: Prisma.StockMovementCreateManyInput[] = []

  for (const [inventoryPartId, decrement] of netDecrement) {
    if (decrement === 0) continue

    // Atomic, org-scoped, and returns the post-write balance in one round trip.
    const updated = await tx.$queryRaw<{ quantity: number }[]>`
      UPDATE "inventory_parts"
      SET "quantity" = "quantity" - ${decrement}, "updatedAt" = NOW()
      WHERE "id" = ${inventoryPartId} AND "organizationId" = ${organizationId}
      RETURNING "quantity"
    `

    // No row matched — unknown part, or one belonging to another organization.
    if (updated.length === 0) continue

    ledgerRows.push({
      inventoryPartId,
      organizationId,
      // The map holds units to decrement; the ledger stores the signed change.
      delta: -decrement,
      quantityAfter: Number(updated[0].quantity),
      reason: context.reason,
      userId: context.userId ?? null,
      serviceRecordId: context.serviceRecordId ?? null,
      serviceRecordLabel: context.serviceRecordLabel ?? null,
      note: context.note ?? null,
    })
  }

  if (ledgerRows.length > 0) {
    await tx.stockMovement.createMany({ data: ledgerRows })
  }
}

/**
 * Record a stock change that did not come from a service record — a manual
 * edit on the inventory screen, or a bulk markup run.
 *
 * `newQuantity` is the absolute value the user set. The delta is derived inside
 * the statement by joining the table to its own pre-update snapshot: in
 * `UPDATE ... FROM`, the FROM relation is scanned using the snapshot taken at
 * statement start, so `prev."quantity"` is the old value while the RETURNING
 * list sees the new one. (Computing `${newQuantity} - "quantity"` directly in
 * RETURNING would always yield 0, since RETURNING evaluates against the updated
 * row.)
 *
 * Returns false when no row matched — unknown part, or wrong organization.
 */
export async function recordAbsoluteStockChange(
  tx: Prisma.TransactionClient,
  organizationId: string,
  inventoryPartId: string,
  newQuantity: number,
  context: StockMovementContext
): Promise<boolean> {
  const updated = await tx.$queryRaw<{ quantity: number; delta: number }[]>`
    UPDATE "inventory_parts" AS p
    SET "quantity" = ${newQuantity}, "updatedAt" = NOW()
    FROM "inventory_parts" AS prev
    WHERE p."id" = prev."id"
      AND p."id" = ${inventoryPartId}
      AND p."organizationId" = ${organizationId}
    RETURNING p."quantity" AS "quantity", (p."quantity" - prev."quantity") AS "delta"
  `

  if (updated.length === 0) return false

  const delta = Number(updated[0].delta)
  if (delta === 0) return true

  await tx.stockMovement.create({
    data: {
      inventoryPartId,
      organizationId,
      delta,
      quantityAfter: Number(updated[0].quantity),
      reason: context.reason,
      userId: context.userId ?? null,
      serviceRecordId: context.serviceRecordId ?? null,
      serviceRecordLabel: context.serviceRecordLabel ?? null,
      note: context.note ?? null,
    },
  })

  return true
}
