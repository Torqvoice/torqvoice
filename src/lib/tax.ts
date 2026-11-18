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
 * Every figure is held to the cent, and the total is built from the rounded
 * ones, so the sheet always adds up: subtotal less discount plus tax is the
 * total, to the cent. The tax is rounded once and the other side follows
 * from it. Left unrounded, each figure was rounded on its own when printed,
 * and 0.94 plus 25% came out as 0.94 + 0.24 = 1.17.
 *
 * A document may carry more than one tax, the way a Québec invoice carries
 * GST and QST, or an Indian one CGST and SGST. Those are `components`: the
 * combined `taxRate` and `taxAmount` keep their meaning, and the components
 * say how the combined tax splits, one printed line and one report line
 * each. A document with no components is a single-rate document and every
 * formula above applies unchanged.
 *
 * Not every line has to be taxed. Many places tax the parts and not the
 * labor, or leave a disposal fee out. Each line says whether it is taxable,
 * and `taxableSubtotal` is the sum of the lines that are, in the same terms
 * as `subtotal`. The tax is then charged on that part of the base alone:
 *     taxableBase = base * taxableSubtotal / subtotal
 * The discount comes off the document as a whole, so the taxable and the
 * untaxed lines each carry it in proportion to their size. In inclusive
 * mode only the taxable lines hold tax, so only they are backed out. A
 * document whose every line is taxable has taxableBase = base, to the cent
 * and by construction, so nothing above changes for it.
 */

import { roundMoney } from './money'

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
      amount: roundMoney(shares[index]),
    }))
  }

  const target = roundMoney(taxAmount)
  const shares = exclusiveShares(1, components)
  const total = shares.reduce((sum, share) => sum + share, 0)
  const split: TaxComponent[] = []
  let allocated = 0
  components.forEach((component, index) => {
    const last = index === components.length - 1
    const amount = last
      ? roundMoney(target - allocated)
      : total > 0
        ? roundMoney(target * (shares[index] / total))
        : 0
    allocated += amount
    split.push({ ...component, amount })
  })
  return split
}

/**
 * The part of a document's base (subtotal less discount) that is taxed.
 *
 * `taxableSubtotal` is the sum of the taxable lines before the discount;
 * null or undefined means every line is taxable. The discount is shared
 * between the taxable and the untaxed lines in proportion, so the taxed
 * part of the base is the same share of it as the taxable lines are of the
 * subtotal. A fully taxable document returns the base itself rather than a
 * recomputed figure, so it cannot drift from it by a rounding.
 */
export function taxableBaseFor(
  base: number,
  subtotal: number,
  taxableSubtotal: number | null | undefined
): number {
  if (taxableSubtotal == null) return base
  const whole = roundMoney(subtotal)
  const taxable = roundMoney(taxableSubtotal)
  if (taxable >= whole) return base
  if (taxable <= 0 || whole <= 0) return 0
  return Math.min(base, roundMoney(base * (taxable / whole)))
}

/**
 * The stored form of a taxable subtotal: null when every line is taxable,
 * which is what every document written before lines could be untaxed holds,
 * and the figure itself when some are not.
 */
export function storedTaxableSubtotal(
  subtotal: number,
  taxableSubtotal: number | null | undefined
): number | null {
  if (taxableSubtotal == null) return null
  const taxable = Math.max(0, roundMoney(taxableSubtotal))
  return taxable >= roundMoney(subtotal) ? null : taxable
}

export function calculateTotals({
  subtotal,
  discountAmount,
  taxRate,
  taxInclusive,
  components,
  taxableSubtotal,
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
  /**
   * The sum of the taxable lines, in the same terms as `subtotal`. Leave it
   * out, or pass null, when every line is taxable.
   */
  taxableSubtotal?: number | null
}): {
  taxAmount: number
  totalAmount: number
  components: TaxComponent[] | null
  /**
   * What the tax was charged on, before tax: the taxed part of the base in
   * exclusive mode, and that part with its tax backed out in inclusive mode.
   * The figure a "Taxable amount" line prints.
   */
  taxableAmount: number
} {
  // The printed subtotal less the printed discount, so the sum on the sheet holds.
  const base = Math.max(0, roundMoney(roundMoney(subtotal) - roundMoney(discountAmount)))
  // The part of it the tax is charged on; the base itself unless some lines are untaxed.
  const taxed = taxableBaseFor(base, subtotal, taxableSubtotal)
  const split = components && components.length > 0 ? components : null
  const rate = split ? combinedTaxRate(split) : taxRate

  if (taxInclusive) {
    if (rate <= 0) {
      return {
        taxAmount: 0,
        totalAmount: base,
        components: split ? withZero(split) : null,
        taxableAmount: taxed,
      }
    }
    const net = taxed / (1 + rate / 100)
    const taxAmount = roundMoney(taxed - net)
    return {
      taxAmount,
      totalAmount: base,
      components: split
        ? splitTaxAmount({ base: taxed, taxAmount, taxInclusive: true, components: split })
        : null,
      taxableAmount: roundMoney(taxed - taxAmount),
    }
  }

  if (split) {
    const parts = splitTaxAmount({
      base: taxed,
      taxAmount: 0,
      taxInclusive: false,
      components: split,
    })
    const taxAmount = roundMoney(parts.reduce((sum, part) => sum + part.amount, 0))
    return {
      taxAmount,
      totalAmount: roundMoney(base + taxAmount),
      components: parts,
      taxableAmount: taxed,
    }
  }
  const taxAmount = roundMoney(taxed * (rate / 100))
  return {
    taxAmount,
    totalAmount: roundMoney(base + taxAmount),
    components: null,
    taxableAmount: taxed,
  }
}

/**
 * The discount on a subtotal, to the cent: a percentage of it, or a fixed
 * amount that cannot take more than there is. Every place that totals a
 * document asks here, so the discount that is stored and printed is the one
 * the total was built from.
 */
export function discountAmountFor(
  subtotal: number,
  discountType: string | null | undefined,
  discountValue: number | null | undefined
): number {
  const value = Number(discountValue) || 0
  if (discountType === 'percentage') return roundMoney(subtotal * (value / 100))
  if (discountType === 'fixed') return roundMoney(Math.min(value, subtotal))
  return 0
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
 * - A line that is not taxable holds no tax in either mode, return as-is.
 */
export function netLineTotal(
  lineTotal: number,
  taxRate: number,
  taxInclusive: boolean,
  taxable: boolean = true
): number {
  if (!taxable || !taxInclusive || taxRate <= 0) return lineTotal
  return lineTotal / (1 + taxRate / 100)
}

/**
 * The net (pre-tax) equivalent of a sum of lines when only some of them are
 * taxable: the untaxed part as it stands, the taxable part with its tax
 * backed out. `taxableTotal` is the taxable lines' share of `total`; null
 * means all of it, which is netLineTotal.
 *
 * For the figures a document shows above its tax line (parts, labor,
 * subtotal), which are sums rather than single lines.
 */
export function netMixedTotal(
  total: number,
  taxableTotal: number | null | undefined,
  taxRate: number,
  taxInclusive: boolean
): number {
  if (!taxInclusive || taxRate <= 0) return total
  const taxable = taxableTotal == null ? total : Math.min(Math.max(0, taxableTotal), total)
  return total - taxable + taxable / (1 + taxRate / 100)
}

/**
 * What a line earned before tax, once the job's discount is counted.
 *
 * The discount comes off the subtotal as a whole rather than off any one
 * line, so each line carries it in proportion to its size. Reports that add
 * lines up (parts revenue, labor revenue, profit) ask here, or a discounted
 * job reads as having earned what it would have without the discount.
 *
 * `subtotal` and `discountAmount` are the stored figures the document was
 * totalled from, in the same terms as the line (gross in inclusive mode), so
 * the share is the same whichever way the prices were entered.
 *
 * `taxable` is the line's own flag: an untaxed line on a tax-inclusive
 * document was entered without tax, so there is none to take out of it.
 */
export function earnedLineTotal(
  lineTotal: number,
  record: {
    taxRate: number
    taxInclusive: boolean
    subtotal?: number | null
    discountAmount?: number | null
  },
  taxable: boolean = true
): number {
  const net = netLineTotal(lineTotal, record.taxRate, record.taxInclusive, taxable)
  const subtotal = Number(record.subtotal) || 0
  const discount = Number(record.discountAmount) || 0
  if (subtotal <= 0 || discount <= 0) return net
  return net * (Math.max(0, subtotal - discount) / subtotal)
}

/**
 * How a document's figures are shown above its tax line, given how its
 * prices were entered and how the sheet wants them read.
 *
 * Two readings exist. Net, the default: every figure before tax, so an
 * inclusive document has the tax taken out of what it shows. With tax
 * (`withTax`), the way a consumer receipt reads: every figure with its tax
 * in it, so an exclusive document has the tax added to what it shows.
 *
 * Either way only a taxable amount is converted. A line left out of the tax
 * holds none and gains none, so it reads the same in every mode, and a sum
 * of lines is converted in its taxable part alone.
 */
export function taxDisplay(args: { taxRate: number; taxInclusive: boolean; withTax?: boolean }): {
  /** One line's figure (its price, its total). */
  line: (value: number, taxable?: boolean) => number
  /** A sum of lines; `taxableTotal` is its taxable part, or null for all of it. */
  mixed: (total: number, taxableTotal: number | null | undefined) => number
  /**
   * The discount, which is shared over every line in proportion and so
   * converts by as much as the subtotal as a whole does.
   */
  discount: (
    discountAmount: number,
    subtotal: number,
    taxableSubtotal: number | null | undefined
  ) => number
} {
  const { taxRate, taxInclusive, withTax = false } = args
  const factor = 1 + taxRate / 100
  const convert = (value: number): number => {
    if (taxRate <= 0) return value
    if (withTax) return taxInclusive ? value : value * factor
    return taxInclusive ? value / factor : value
  }
  const mixed = (total: number, taxableTotal: number | null | undefined): number => {
    if (taxableTotal == null) return convert(total)
    const taxable = Math.min(Math.max(0, taxableTotal), Math.max(0, total))
    return total - taxable + convert(taxable)
  }
  return {
    line: (value, taxable = true) => (taxable ? convert(value) : value),
    mixed,
    discount: (discountAmount, subtotal, taxableSubtotal) => {
      if (taxableSubtotal == null || subtotal <= 0) return convert(discountAmount)
      return discountAmount * (mixed(subtotal, taxableSubtotal) / subtotal)
    },
  }
}

/**
 * What a stored document's tax was charged on, before tax: the figure a tax
 * report calls the taxable amount.
 *
 * With every line taxed that is the total less the tax, in either mode and
 * with any discount already counted. With some lines untaxed it is only the
 * taxable lines' share of that, the same share the tax itself was worked
 * out on (see taxableBaseFor), so the report's taxable amount times the
 * rate comes back to the tax collected.
 */
export function taxedNetAmountOf(doc: {
  totalAmount: number
  taxAmount: number
  taxInclusive: boolean
  subtotal: number
  /** Sum of the taxable lines, or null when every line is taxable. */
  taxableSubtotal?: number | null
}): number {
  const whole = Math.max(0, doc.totalAmount - doc.taxAmount)
  if (doc.taxableSubtotal == null || doc.subtotal <= 0) return whole
  const share = Math.min(1, Math.max(0, doc.taxableSubtotal / doc.subtotal))
  // Inclusive: the total is the gross base, so its taxed part less the tax
  // inside it. Exclusive: the total less the tax is the net base already.
  return doc.taxInclusive ? Math.max(0, doc.totalAmount * share - doc.taxAmount) : whole * share
}

/** Two percentages that print the same are the same rate. */
export function ratesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005
}
