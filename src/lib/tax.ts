/**
 * Tax calculation for service records and quotes.
 *
 * Two modes are supported, controlled by `taxInclusive`:
 *
 * - Exclusive (default): the per-line prices the user enters are NET (pre-tax).
 *   subtotal is the sum of net line totals. Tax is added on top.
 *     base       = subtotal - discountAmount
 *     taxAmount  = base * taxRate / 100
 *     totalAmount= base + taxAmount
 *
 * - Inclusive: the per-line prices the user enters are GROSS (tax included).
 *   subtotal is the sum of gross line totals. Tax is reverse-calculated out
 *   of the gross. The total equals the gross-after-discount; the tax line is
 *   informational and is NOT added on top.
 *     base       = subtotal - discountAmount   (still gross)
 *     net        = base / (1 + taxRate / 100)
 *     taxAmount  = base - net
 *     totalAmount= base
 *
 * In both modes, `subtotal` and `totalAmount` are stored as-displayed-to-user
 * (net in exclusive mode, gross in inclusive mode), so existing PDFs and DB
 * rows remain consistent.
 */
export function calculateTotals({
  subtotal,
  discountAmount,
  taxRate,
  taxInclusive,
}: {
  subtotal: number
  discountAmount: number
  taxRate: number
  taxInclusive: boolean
}): { taxAmount: number; totalAmount: number } {
  const base = Math.max(0, subtotal - discountAmount)
  if (taxInclusive) {
    if (taxRate <= 0) {
      return { taxAmount: 0, totalAmount: base }
    }
    const net = base / (1 + taxRate / 100)
    const taxAmount = base - net
    return { taxAmount, totalAmount: base }
  }
  const taxAmount = base * (taxRate / 100)
  return { taxAmount, totalAmount: base + taxAmount }
}

/**
 * Convert a single line-item total (gross or net depending on mode) to its
 * net (pre-tax) equivalent. Used by financial reports so parts/labor revenue
 * aggregations are consistent regardless of how the parent record was entered.
 *
 * - Exclusive mode: line totals are already net, return as-is.
 * - Inclusive mode with rate > 0: line totals are gross, divide by (1 + rate/100).
 * - Tax rate of 0: no tax to back out, return as-is.
 */
export function netLineTotal(
  lineTotal: number,
  taxRate: number,
  taxInclusive: boolean,
): number {
  if (!taxInclusive || taxRate <= 0) return lineTotal
  return lineTotal / (1 + taxRate / 100)
}
