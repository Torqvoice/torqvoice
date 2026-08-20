import { db } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { calculateTotals } from '@/lib/tax'

/**
 * Re-totals a service record from its line items.
 *
 * The invoice screen keeps this in step while someone is editing. Anything
 * that adds a line from outside has to do the same, or the record shows a
 * total that does not match what is printed on it.
 *
 * Uses calculateTotals and the same discount rules as the editor rather than
 * its own arithmetic, so a storage line, a prep line and a parts line cannot
 * disagree about what inclusive tax means.
 */
export async function retotalServiceRecord(
  serviceRecordId: string,
  tx: Prisma.TransactionClient | typeof db = db
): Promise<void> {
  const record = await tx.serviceRecord.findUnique({
    where: { id: serviceRecordId },
    select: { discountType: true, discountValue: true, taxRate: true, taxInclusive: true },
  })
  if (!record) return

  const [parts, labor] = await Promise.all([
    tx.servicePart.aggregate({ where: { serviceRecordId }, _sum: { total: true } }),
    tx.serviceLabor.aggregate({ where: { serviceRecordId }, _sum: { total: true } }),
  ])

  const subtotal = (parts._sum.total || 0) + (labor._sum.total || 0)
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
    where: { id: serviceRecordId },
    data: { subtotal, taxAmount, totalAmount },
  })
}
