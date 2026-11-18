import { calculateTotals, discountAmountFor } from '@/lib/tax'
import { taxableSubtotalOf } from '@/lib/taxable-lines'

/** What `invoiceDisplayTotal` reads off a work order. */
export const INVOICE_DISPLAY_TOTAL_COLUMNS = {
  totalAmount: true,
  cost: true,
  taxRate: true,
  taxInclusive: true,
  discountType: true,
  discountValue: true,
  partItems: { select: { total: true, taxable: true } },
  laborItems: { select: { total: true, taxable: true, pricingType: true } },
} as const

export interface InvoiceDisplayTotalRow {
  totalAmount: number
  cost: number
  taxRate: number
  taxInclusive: boolean | null
  discountType: string | null
  discountValue: number
  partItems: { total: number; taxable?: boolean | null }[]
  laborItems: { total: number; taxable?: boolean | null; pricingType?: string | null }[]
}

/**
 * The total the customer sees on a shared invoice, and so the amount that is
 * owed: the stored total, or the one its lines add up to, or the plain cost
 * of a job that has neither. The share page, its checkout and the link's
 * "is it paid" all read this one figure.
 */
export function invoiceDisplayTotal(record: InvoiceDisplayTotalRow): number {
  if (record.totalAmount > 0) return record.totalAmount
  const subtotal =
    record.partItems.reduce((sum, p) => sum + p.total, 0) +
    record.laborItems.reduce((sum, l) => sum + l.total, 0)
  const { totalAmount: computed } = calculateTotals({
    subtotal,
    discountAmount: discountAmountFor(subtotal, record.discountType, record.discountValue),
    taxRate: record.taxRate,
    taxInclusive: record.taxInclusive ?? false,
    // The stored lines carry a plain yes or no.
    taxableSubtotal: taxableSubtotalOf(record.partItems, record.laborItems),
  })
  return computed > 0 ? computed : record.cost
}
