import { roundMoney } from '@/lib/money'
import { discountAmountFor } from '@/lib/tax'

/**
 * What a job's lines add up to, each line held to the cent first, the way
 * the save stores it (serviceSchema rounds every line total).
 *
 * The editor adds up its own figures, and before the lines were rounded on
 * save those were the stored ones. Now a page that sums 2 x 2.5 h at 19.99
 * as 99.95 saves two lines of 49.98, and a subtotal taken from the page
 * would not be what the lines on the invoice add up to. A save that sends
 * its lines therefore has its subtotal restated from them.
 */
export function subtotalFromLines(
  parts: readonly { total: number | string | null | undefined }[],
  labor: readonly { total: number | string | null | undefined }[]
): number {
  const sum = (lines: readonly { total: number | string | null | undefined }[]) =>
    lines.reduce((total, line) => total + roundMoney(line.total), 0)
  return roundMoney(sum(parts) + sum(labor))
}

/**
 * The subtotal and the discount a save stores, restated from its lines when
 * they disagree with what the page sent. A percentage discount follows the
 * subtotal and a fixed one is capped by it; with no discount type the sent
 * amount is left alone (undefined). Null when the page was right.
 */
export function restatedSubtotal(args: {
  sentSubtotal: number
  linesSubtotal: number
  discountType: string | null | undefined
  discountValue: number | null | undefined
}): { subtotal: number; discountAmount: number | undefined } | null {
  if (roundMoney(args.sentSubtotal) === args.linesSubtotal) return null
  return {
    subtotal: args.linesSubtotal,
    discountAmount:
      args.discountType === 'percentage' || args.discountType === 'fixed'
        ? discountAmountFor(args.linesSubtotal, args.discountType, args.discountValue)
        : undefined,
  }
}
