import { db } from '@/lib/db'
import { calculateTotals } from '@/lib/tax'
import { reconcileInventoryForParts } from '@/features/inventory/Lib/reconcileStock'

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
  unitPrice: number
  total: number
  unitCost: number
  inventoryPartId?: string | null
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

  const record = await db.serviceRecord.findFirst({
    where: { id: input.serviceRecordId, organizationId },
    select: {
      id: true,
      vehicleId: true,
      subtotal: true,
      taxRate: true,
      taxInclusive: true,
      discountType: true,
      discountValue: true,
      title: true,
      invoiceNumber: true,
    },
  })
  if (!record) throw new AddPartError('job_not_found', 'Service record not found')

  const part = await db.$transaction(async (tx) => {
    const created = await tx.servicePart.create({
      data: {
        partNumber: input.partNumber || null,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit || null,
        unitPrice: input.unitPrice,
        total: input.total,
        unitCost: input.unitCost,
        inventoryPartId: input.inventoryPartId || null,
        serviceRecordId: record.id,
      },
    })

    const [partsAgg, laborAgg] = await Promise.all([
      tx.servicePart.aggregate({
        where: { serviceRecordId: record.id },
        _sum: { total: true },
      }),
      tx.serviceLabor.aggregate({
        where: { serviceRecordId: record.id },
        _sum: { total: true },
      }),
    ])

    const subtotal = (partsAgg._sum.total || 0) + (laborAgg._sum.total || 0)
    const discountAmount =
      record.discountType === 'percentage'
        ? subtotal * ((record.discountValue ?? 0) / 100)
        : record.discountType === 'fixed'
          ? Math.min(record.discountValue ?? 0, subtotal)
          : 0
    const { taxAmount, totalAmount } = calculateTotals({
      subtotal,
      discountAmount,
      taxRate: record.taxRate,
      taxInclusive: record.taxInclusive,
    })

    await tx.serviceRecord.update({
      where: { id: record.id },
      data: { subtotal, taxAmount, totalAmount },
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
