import type { Prisma } from '@/generated/prisma/client'
import { reconcileInventoryForParts } from '@/features/inventory/Lib/reconcileStock'

export type TireLineInput = {
  serviceRecordId: string
  /** Shown on the job and the invoice. The stocked part's name, or the set. */
  name: string
  partNumber: string | null
  quantity: number
  unitPrice: number
  unitCost: number
  /** Null for a set that is not a catalogue item, which moves no stock. */
  inventoryPartId: string | null
  /**
   * Denormalised job label for the stock ledger, so the movement still reads
   * sensibly once the record is gone.
   */
  recordLabel: string
}

/**
 * Puts the tires on a job, and takes them off the shelf.
 *
 * These are one operation, not two. Deleting a work order restocks every
 * linked part line it finds, so a line written without the matching movement
 * hands back stock that was never taken: sell four tires, delete the job, and
 * the shelf now claims eight. Keeping the write and the movement in one
 * function is what stops the two drifting apart again.
 *
 * A line with no inventoryPartId is free text and moves nothing, which is the
 * same rule the parts editor follows.
 *
 * MUST be called inside a transaction, so the line, the stock and the ledger
 * commit or roll back together.
 */
export async function addTireLineToRecord(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string | null,
  line: TireLineInput
): Promise<void> {
  await tx.servicePart.create({
    data: {
      serviceRecordId: line.serviceRecordId,
      name: line.name,
      partNumber: line.partNumber,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      unitCost: line.unitCost,
      total: Math.round(line.unitPrice * line.quantity * 100) / 100,
      inventoryPartId: line.inventoryPartId,
    },
  })

  if (!line.inventoryPartId) return

  await reconcileInventoryForParts(
    tx,
    organizationId,
    [],
    [{ inventoryPartId: line.inventoryPartId, quantity: line.quantity }],
    {
      reason: 'service_record',
      userId,
      serviceRecordId: line.serviceRecordId,
      serviceRecordLabel: line.recordLabel,
    }
  )
}
