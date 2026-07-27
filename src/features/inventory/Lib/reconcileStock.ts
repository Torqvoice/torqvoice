import type { Prisma } from "@/generated/prisma/client";

/**
 * A part line that may be linked to an inventory item. Only lines with a
 * non-null `inventoryPartId` move stock; free-text parts are ignored.
 */
export interface StockPartLine {
  inventoryPartId?: string | null;
  quantity: number;
}

/**
 * Convert a (possibly fractional) part quantity into whole stock units.
 *
 * `InventoryPart.quantity` is an integer column while `ServicePart.quantity`
 * is a float, so we round to the nearest whole unit. Rounding is applied
 * identically to the previous and next sets, so any delta stays internally
 * consistent across create / edit / delete.
 */
function stockUnits(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.round(quantity);
}

/**
 * Apply the net inventory movement for a service record whose linked parts
 * change from `previous` to `next`.
 *
 * Semantics:
 *   - A part present in `next` but not `previous` (or with a larger quantity)
 *     consumes stock → decrement.
 *   - A part removed or reduced restocks → increment.
 *   - Unchanged quantities produce a zero delta and touch nothing.
 *
 * The movement is computed per `inventoryPartId` as the sum of `next`
 * quantities minus the sum of `previous` quantities, then applied with a
 * single atomic `{ decrement }` per part (a negative delta increments, i.e.
 * restocks). Because it is atomic and never reads-then-writes, concurrent
 * deploys/requests cannot lose updates.
 *
 * Every write is scoped to `organizationId`, so a stale or cross-organization
 * `inventoryPartId` simply matches no rows and is skipped — it can never
 * mutate another tenant's inventory.
 *
 * Stock is allowed to go negative: over-consuming is real information
 * ("you used more than you had on hand") and, crucially, keeps the operation
 * reversible. Clamping at zero would corrupt the count as soon as the part is
 * later removed or the record deleted.
 *
 * MUST be called inside a transaction so the stock movement commits or rolls
 * back together with the ServicePart changes that caused it.
 */
export async function reconcileInventoryForParts(
  tx: Prisma.TransactionClient,
  organizationId: string,
  previous: readonly StockPartLine[],
  next: readonly StockPartLine[],
): Promise<void> {
  // inventoryPartId -> net units to DECREMENT (negative = restock)
  const netDecrement = new Map<string, number>();

  for (const line of previous) {
    if (!line.inventoryPartId) continue;
    const current = netDecrement.get(line.inventoryPartId) ?? 0;
    netDecrement.set(line.inventoryPartId, current - stockUnits(line.quantity));
  }
  for (const line of next) {
    if (!line.inventoryPartId) continue;
    const current = netDecrement.get(line.inventoryPartId) ?? 0;
    netDecrement.set(line.inventoryPartId, current + stockUnits(line.quantity));
  }

  for (const [inventoryPartId, delta] of netDecrement) {
    if (delta === 0) continue;
    await tx.inventoryPart.updateMany({
      where: { id: inventoryPartId, organizationId },
      data: { quantity: { decrement: delta } },
    });
  }
}
