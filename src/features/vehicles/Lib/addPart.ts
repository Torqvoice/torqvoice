import { discountAmountFor } from '@/lib/tax'
import { db } from '@/lib/db'
import { refreshShopFeeLines } from './shopFeeLines'
import { serviceRecordLineSums } from './lineSums'
import { loadTaxApplies } from '@/features/settings/Lib/loadTaxApplies'
import { documentTotals } from '@/features/settings/Lib/workshopTax'
import { reconcileInventoryForParts } from '@/features/inventory/Lib/reconcileStock'
import { assertInvoiceEditable } from '@/lib/document-lock.server'

/**
 * Adds a part line to a job, recalculates the job's money, and moves the stock.
 *
 * Lifted out of the server action so the technician API can do exactly the
 * same thing. Two implementations of "add a part" would drift on the part that
 * matters least visibly and most expensively: whether stock actually moved.
 *
 * Everything happens in one transaction. A line that exists without its stock
 * movement is a part the shop thinks it still has on the shelf.
 */

export interface AddPartInput {
  serviceRecordId: string
  partNumber?: string | null
  name: string
  quantity: number
  unit?: string | null
  category?: string | null
  unitPrice: number
  total: number
  unitCost: number
  inventoryPartId?: string | null
  /** Left out, the line takes the workshop's answer for parts. */
  taxable?: boolean
}

export class AddPartError extends Error {
  constructor(
    public code: 'job_not_found',
    message: string
  ) {
    super(message)
    this.name = 'AddPartError'
  }
}

export async function addPart(args: {
  organizationId: string
  userId: string
  input: AddPartInput
}) {
  const { organizationId, userId, input } = args

  // Guarded here rather than at each caller: the server action and the
  // technician API both come through this function, and a lock enforced in
  // only one of them is not a lock.
  await assertInvoiceEditable(input.serviceRecordId, organizationId)

  const record = await db.serviceRecord.findFirst({
    where: { id: input.serviceRecordId, organizationId },
    select: {
      id: true,
      vehicleId: true,
      subtotal: true,
      taxRate: true,
      taxInclusive: true,
      taxComponents: true,
      discountType: true,
      discountValue: true,
      title: true,
      invoiceNumber: true,
    },
  })
  if (!record) throw new AddPartError('job_not_found', 'Service record not found')

  const taxable = input.taxable ?? (await loadTaxApplies(organizationId)).parts

  const part = await db.$transaction(async (tx) => {
    const created = await tx.servicePart.create({
      data: {
        partNumber: input.partNumber || null,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit || null,
        category: input.category || null,
        unitPrice: input.unitPrice,
        total: input.total,
        unitCost: input.unitCost,
        inventoryPartId: input.inventoryPartId || null,
        taxable,
        serviceRecordId: record.id,
      },
    })

    await refreshShopFeeLines(tx, record.id, organizationId)

    const sums = await serviceRecordLineSums(tx, record.id)
    const subtotal = sums.subtotal
    const discountAmount = discountAmountFor(subtotal, record.discountType, record.discountValue)
    const { taxAmount, totalAmount, taxComponents, taxableSubtotal } = documentTotals({
      subtotal,
      discountAmount,
      taxRate: record.taxRate,
      taxInclusive: record.taxInclusive,
      taxComponents: record.taxComponents,
      taxableSubtotal: sums.taxableSubtotal,
    })

    await tx.serviceRecord.update({
      where: { id: record.id },
      data: { subtotal, taxAmount, totalAmount, taxComponents, taxableSubtotal },
    })

    // Deduct stock for the newly added line (delta from empty).
    await reconcileInventoryForParts(
      tx,
      organizationId,
      [],
      [{ inventoryPartId: input.inventoryPartId ?? undefined, quantity: input.quantity }],
      {
        reason: 'service_record',
        userId,
        serviceRecordId: record.id,
        serviceRecordLabel: record.invoiceNumber || record.title,
      }
    )

    return created
  })

  return { part, vehicleId: record.vehicleId }
}
