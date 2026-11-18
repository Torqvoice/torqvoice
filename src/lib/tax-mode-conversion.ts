/**
 * Moving a stored document between tax-exclusive and tax-inclusive prices
 * without moving what the customer pays.
 *
 * Only the taxable lines hold tax, so only they are re-priced: up by the
 * rate when the prices become inclusive, down by it when they become
 * exclusive. A line left out of the tax reads the same either way. The
 * subtotal moves by exactly what its taxable part moved.
 *
 * A fixed discount is scaled by how much the subtotal moved, which keeps the
 * total where it was: the discount is shared over the taxable and untaxed
 * lines in proportion, so it has to stay the same share of the subtotal. On
 * a document whose every line is taxable that is the tax factor itself, as
 * it always was.
 */
export function taxModeConversion(
  doc: {
    subtotal: number
    /** Sum of the taxable lines, or null when every line is taxable. */
    taxableSubtotal: number | null
    discountType: string | null
    discountValue: number
    discountAmount: number
    taxRate: number
  },
  to: 'inclusive' | 'exclusive'
): {
  /** Re-prices a figure of a taxable line (its price, its total). Untaxed lines are left alone. */
  scaleLine: (value: number) => number
  subtotal: number
  taxableSubtotal: number | null
  discountValue: number
  discountAmount: number
} {
  const factor = 1 + doc.taxRate / 100
  // Multiplied or divided by the factor itself, never by its reciprocal, so
  // a line converted one way and back returns to the same figure.
  const scaleLine = (value: number) => (to === 'inclusive' ? value * factor : value / factor)

  if (doc.taxableSubtotal == null) {
    return {
      scaleLine,
      subtotal: scaleLine(doc.subtotal),
      taxableSubtotal: null,
      discountAmount: scaleLine(doc.discountAmount),
      discountValue:
        doc.discountType === 'fixed' ? scaleLine(doc.discountValue) : doc.discountValue,
    }
  }

  const taxable = Math.min(Math.max(0, doc.taxableSubtotal), doc.subtotal)
  const subtotal = doc.subtotal - taxable + scaleLine(taxable)
  const discountFactor = doc.subtotal > 0 ? subtotal / doc.subtotal : 1
  return {
    scaleLine,
    subtotal,
    taxableSubtotal: scaleLine(taxable),
    discountAmount: doc.discountAmount * discountFactor,
    discountValue:
      doc.discountType === 'fixed' ? doc.discountValue * discountFactor : doc.discountValue,
  }
}
