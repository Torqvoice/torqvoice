import { roundMoney } from '@/lib/money'
import type { db, TxClient } from '@/lib/db'

/**
 * What a work order's lines add up to, and how much of that is taxed.
 *
 * Every path that re-totals a job from its stored lines asks here, so the
 * subtotal and the taxable part of it are always read the same way and in
 * the same transaction as the lines they describe.
 */
export async function serviceRecordLineSums(
  tx: TxClient | typeof db,
  serviceRecordId: string
): Promise<{ subtotal: number; taxableSubtotal: number }> {
  const [parts, labor, taxableParts, taxableLabor] = await Promise.all([
    tx.servicePart.aggregate({ where: { serviceRecordId }, _sum: { total: true } }),
    tx.serviceLabor.aggregate({ where: { serviceRecordId }, _sum: { total: true } }),
    tx.servicePart.aggregate({
      where: { serviceRecordId, taxable: true },
      _sum: { total: true },
    }),
    tx.serviceLabor.aggregate({
      where: { serviceRecordId, taxable: true },
      _sum: { total: true },
    }),
  ])
  return {
    subtotal: (parts._sum.total || 0) + (labor._sum.total || 0),
    taxableSubtotal: roundMoney((taxableParts._sum.total || 0) + (taxableLabor._sum.total || 0)),
  }
}
