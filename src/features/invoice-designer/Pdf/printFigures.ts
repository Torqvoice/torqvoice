import { calculateTotals, taxDisplay } from '@/lib/tax'

type Line = { total: number; taxable?: boolean | null; excluded?: boolean }

/**
 * The figures a sheet prints above its tax line, worked out once for the
 * invoice, the quote and the work order so the three cannot disagree.
 *
 * A sheet shows its amounts either before tax or with tax in them (the
 * workshop's choice), and a line left out of the tax reads the same either
 * way. So every amount is converted in its taxable part only: a line by its
 * own flag, a sum of lines by how much of it is taxable.
 *
 * Lines the customer declined on a quote (`excluded`) count toward nothing.
 * A line that does not say is taxable, which is every line stored before a
 * line could be left out.
 */
export function printFigures(args: {
  taxRate: number
  taxInclusive: boolean
  /** The sheet prints its lines with tax in them. */
  linesInclTax: boolean
  parts: readonly Line[]
  labor: readonly Line[]
}) {
  const { taxRate, taxInclusive, linesInclTax } = args
  const display = taxDisplay({ taxRate, taxInclusive, withTax: linesInclTax })

  const isTaxable = (line: Line) => line.taxable !== false
  const sumOf = (lines: readonly Line[]) => lines.reduce((sum, line) => sum + line.total, 0)
  // Null when every line is taxable, so a fully taxed sum is converted as
  // one figure, exactly as it was before lines could be untaxed.
  const taxablePartOf = (lines: readonly Line[]): number | null =>
    lines.every(isTaxable) ? null : sumOf(lines.filter(isTaxable))

  const parts = args.parts.filter((line) => !line.excluded)
  const labor = args.labor.filter((line) => !line.excluded)
  const partsTotal = sumOf(parts)
  const laborTotal = sumOf(labor)
  const taxableSubtotal = taxablePartOf([...parts, ...labor])

  return {
    /** A line's own figure (its price, its total), by the line's flag. */
    shown: (value: number, taxable: boolean = true) => display.line(value, taxable),
    /** The counted lines added up as entered, before any conversion. */
    partsTotal,
    laborTotal,
    /** The same sums as the sheet shows them. */
    partsShown: display.mixed(partsTotal, taxablePartOf(parts)),
    laborShown: display.mixed(laborTotal, taxablePartOf(labor)),
    /** The sum of the taxable lines, or null when every line is taxed. */
    taxableSubtotal,
    subtotalShown: (subtotal: number) => display.mixed(subtotal, taxableSubtotal),
    discountShown: (discountAmount: number, subtotal: number) =>
      display.discount(discountAmount, subtotal, taxableSubtotal),
    /**
     * What the tax was charged on, for the "Taxable amount" row. Null when
     * the whole document is taxed, or not taxed at all: the row would then
     * repeat the subtotal or describe a tax that is not there.
     */
    taxableAmount: (subtotal: number, discountAmount: number): number | null =>
      taxableSubtotal === null || taxRate <= 0
        ? null
        : calculateTotals({ subtotal, discountAmount, taxRate, taxInclusive, taxableSubtotal })
            .taxableAmount,
  }
}
