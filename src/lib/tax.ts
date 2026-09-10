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
 *
 * A document may carry more than one tax, the way a Québec invoice carries
 * GST and QST, or an Indian one CGST and SGST. Those are `components`: the
 * combined `taxRate` and `taxAmount` keep their meaning, and the components
 * say how the combined tax splits, one printed line and one report line
 * each. A document with no components is a single-rate document and every
 * formula above applies unchanged.
 */

/** One tax on a document, as the workshop defines it in settings. */
export interface TaxComponentDefinition {
  /** Printed on the invoice and used to group the tax report: "GST", "QST". */
  name: string
  /** Percent, as typed: 5, 9.975. */
  rate: number
  /** The workshop's registration for this tax, printed under the business details. */
  registrationNumber?: string
  /**
   * Charged on the price plus the taxes listed before it, instead of on the
   * price alone. Off for every market shipped so far; Québec stopped
   * compounding QST on GST in 2013. Kept in the shape so a row written today
   * still reads correctly if a compounding market is added.
   */
  compound?: boolean
}

/** A component as stored on a document: the definition plus its share of the tax. */
export interface TaxComponent extends TaxComponentDefinition {
  amount: number
}

/**
 * Money is kept to the cent per component, because that is how each tax is
 * declared and how each line prints. The nudge keeps a value that sits
 * exactly on a half-cent in binary (89.775 is really 89.77499...) rounding
 * the way a person expects.
 */
function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Each component's tax on a net base, in exclusive terms, before rounding.
 * A compounding component takes the base plus everything charged before it.
 */
function exclusiveShares(base: number, components: TaxComponentDefinition[]): number[] {
  const shares: number[] = []
  let charged = 0
  for (const component of components) {
    const on = component.compound ? base + charged : base
    const amount = on * (component.rate / 100)
    shares.push(amount)
    charged += amount
  }
  return shares
}

/**
 * The rate a document's components add up to: the single figure `taxRate`
 * holds, so nothing that reads one rate needs to know about the split.
 * Plain sums for non-compounding components (5 + 9.975 = 14.975); the
 * effective rate when one compounds. Trimmed of float noise, not rounded.
 */
export function combinedTaxRate(components: TaxComponentDefinition[]): number {
  const total = exclusiveShares(100, components).reduce((sum, share) => sum + share, 0)
  return Math.round(total * 1e6) / 1e6
}

/**
 * Splits a document's tax across its components.
 *
 * Exclusive mode charges each component on the net base and rounds it to
 * the cent, the way each tax is assessed; the combined tax is then their
 * sum, so the printed lines always add up to the total.
 *
 * Inclusive mode already knows the combined tax (backed out of the gross);
 * it is shared out in proportion to what each component would have charged,
 * and the last component takes the rounding remainder, so again the lines
 * add up to the tax the customer was told.
 */
export function splitTaxAmount(args: {
  base: number
  taxAmount: number
  taxInclusive: boolean
  components: TaxComponentDefinition[]
}): TaxComponent[] {
  const { base, taxAmount, taxInclusive, components } = args
  if (components.length === 0) return []

  if (!taxInclusive) {
    const shares = exclusiveShares(base, components)
    return components.map((component, index) => ({
      ...component,
      amount: roundCents(shares[index]),
    }))
  }

  const target = roundCents(taxAmount)
  const shares = exclusiveShares(1, components)
  const total = shares.reduce((sum, share) => sum + share, 0)
  const split: TaxComponent[] = []
  let allocated = 0
  components.forEach((component, index) => {
    const last = index === components.length - 1
    const amount = last
      ? roundCents(target - allocated)
      : total > 0
        ? roundCents(target * (shares[index] / total))
        : 0
    allocated += amount
    split.push({ ...component, amount })
  })
  return split
}

export function calculateTotals({
  subtotal,
  discountAmount,
  taxRate,
  taxInclusive,
  components,
}: {
  subtotal: number
  discountAmount: number
  taxRate: number
  taxInclusive: boolean
  /**
   * The document's tax components, when it has them. Their rates decide the
   * tax; `taxRate` is only read when there are none, since a document with
   * components stores their combined rate there anyway.
   */
  components?: TaxComponentDefinition[] | null
}): { taxAmount: number; totalAmount: number; components: TaxComponent[] | null } {
  const base = Math.max(0, subtotal - discountAmount)
  const split = components && components.length > 0 ? components : null
  const rate = split ? combinedTaxRate(split) : taxRate

  if (taxInclusive) {
    if (rate <= 0) {
      return { taxAmount: 0, totalAmount: base, components: split ? withZero(split) : null }
    }
    const net = base / (1 + rate / 100)
    const taxAmount = base - net
    return {
      taxAmount,
      totalAmount: base,
      components: split
        ? splitTaxAmount({ base, taxAmount, taxInclusive: true, components: split })
        : null,
    }
  }

  if (split) {
    const parts = splitTaxAmount({ base, taxAmount: 0, taxInclusive: false, components: split })
    const taxAmount = parts.reduce((sum, part) => sum + part.amount, 0)
    return { taxAmount, totalAmount: base + taxAmount, components: parts }
  }
  const taxAmount = base * (rate / 100)
  return { taxAmount, totalAmount: base + taxAmount, components: null }
}

function withZero(components: TaxComponentDefinition[]): TaxComponent[] {
  return components.map((component) => ({ ...component, amount: 0 }))
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
export function netLineTotal(lineTotal: number, taxRate: number, taxInclusive: boolean): number {
  if (!taxInclusive || taxRate <= 0) return lineTotal
  return lineTotal / (1 + taxRate / 100)
}
