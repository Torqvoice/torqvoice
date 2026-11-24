import type { z } from 'zod'

/**
 * The largest figures and the longest texts the forms take.
 *
 * Well past anything a workshop writes, and short of what breaks a page or a
 * document: a quantity of a billion at a hundred million each once saved,
 * printed a total of 119,999,998,800,000,000 with float noise in it and
 * pushed the invoice off the page, and a 3,000-character address made a
 * customer's header 21,545 px wide. The schemas refuse past these, and the
 * forms carry the same numbers so the browser can say so first.
 */

/** Of one part on a line. */
export const QUANTITY_MAX = 100_000
/** A unit price, a unit cost or an hourly rate. */
export const UNIT_PRICE_MAX = 10_000_000
/** Hours on one labour line, or the count of a line priced per service. */
export const LABOR_HOURS_MAX = 100_000
/**
 * One line's total. Money is rounded to the cent on twelve significant
 * digits (src/lib/money.ts), so a total has to stay below ten billion for
 * the cents to survive; this keeps it well inside.
 */
export const LINE_TOTAL_MAX = 1_000_000_000
/** An odometer or an hour meter, as the technician app already takes it. */
export const READING_MAX = 10_000_000

/**
 * A priced line's own rules, for every schema that takes one (work orders,
 * labour presets): its count times its price no more than LINE_TOTAL_MAX,
 * whatever total the caller sent, and, with `pricedNeedsCount`, a priced line
 * at a count of zero refused. Reported as zod's own size issues, so a form
 * says them in words (src/lib/field-errors.ts).
 */
export function checkLineAmounts(
  line: { count: number; price: number },
  ctx: z.RefinementCtx,
  /** Where each problem is reported: the count field, and the field the line total is said under. */
  fields: { count: string; total: string },
  options: { pricedNeedsCount?: boolean } = {}
): void {
  if (options.pricedNeedsCount && line.price > 0 && line.count <= 0) {
    ctx.addIssue({
      code: 'too_small',
      origin: 'number',
      minimum: 0,
      inclusive: false,
      path: [fields.count],
      message: 'A priced line needs a quantity above zero',
      input: line.count,
    })
  }
  if (line.count * line.price > LINE_TOTAL_MAX) {
    ctx.addIssue({
      code: 'too_big',
      origin: 'number',
      maximum: LINE_TOTAL_MAX,
      inclusive: true,
      path: [fields.total],
      message: `A line can come to at most ${LINE_TOTAL_MAX}`,
      input: line.price,
    })
  }
}

/**
 * What is wrong with one figure on a line, in the terms of
 * src/lib/field-errors.ts, so a line editor can say it under the field.
 */
export interface LineFigureIssue {
  issue: 'negative' | 'positive' | 'tooLarge'
  limit?: number
}

/** A figure as typed: an empty box or letters count as nothing, as the save reads them. */
function figure(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function bounded(value: number, max: number): LineFigureIssue | undefined {
  if (value < 0) return { issue: 'negative' }
  if (value > max) return { issue: 'tooLarge', limit: max }
  return undefined
}

export type PartLineIssues = Partial<
  Record<'quantity' | 'unitPrice' | 'unitCost' | 'total', LineFigureIssue>
>
export type LaborLineIssues = Partial<Record<'hours' | 'rate' | 'total', LineFigureIssue>>

/**
 * The figures on a part line the save would refuse, by field: the rules of
 * servicePartSchema and quotePartSchema, worked out as the line is typed so
 * the field is marked before anybody presses Save. The line's quantity times
 * its price is reported as "total", said under the line's total.
 */
export function partLineIssues(part: {
  name?: string | null
  quantity: unknown
  unitPrice: unknown
  unitCost?: unknown
}): PartLineIssues {
  const quantity = figure(part.quantity)
  const unitPrice = figure(part.unitPrice)
  const issues: PartLineIssues = {}
  const quantityIssue = bounded(quantity, QUANTITY_MAX)
  if (quantityIssue) issues.quantity = quantityIssue
  // Priced and billed nothing. A free part may sit at zero as a note of what
  // was used, and a row with no name yet is still being typed.
  else if (part.name?.trim() && unitPrice > 0 && quantity <= 0) {
    issues.quantity = { issue: 'positive' }
  }
  const priceIssue = bounded(unitPrice, UNIT_PRICE_MAX)
  if (priceIssue) issues.unitPrice = priceIssue
  const costIssue = bounded(figure(part.unitCost), UNIT_PRICE_MAX)
  if (costIssue) issues.unitCost = costIssue
  if (quantity * unitPrice > LINE_TOTAL_MAX) {
    issues.total = { issue: 'tooLarge', limit: LINE_TOTAL_MAX }
  }
  return issues
}

/**
 * The figures on a labour line the save would refuse, by field. Hours may be
 * zero: a line started and not yet clocked, or work done for nothing.
 */
export function laborLineIssues(labor: { hours: unknown; rate: unknown }): LaborLineIssues {
  const hours = figure(labor.hours)
  const rate = figure(labor.rate)
  const issues: LaborLineIssues = {}
  const hoursIssue = bounded(hours, LABOR_HOURS_MAX)
  if (hoursIssue) issues.hours = hoursIssue
  const rateIssue = bounded(rate, UNIT_PRICE_MAX)
  if (rateIssue) issues.rate = rateIssue
  if (hours * rate > LINE_TOTAL_MAX) issues.total = { issue: 'tooLarge', limit: LINE_TOTAL_MAX }
  return issues
}

/** A person's or a company's name, a make, a model. */
export const NAME_MAX_LENGTH = 200
/** A postal address, street to country. */
export const ADDRESS_MAX_LENGTH = 500
/** Free notes. */
export const NOTES_MAX_LENGTH = 10_000
/** An email address, as long as the standard allows. */
export const EMAIL_MAX_LENGTH = 254
/** A phone number, a tax id, a plate, a code. */
export const SHORT_TEXT_MAX_LENGTH = 50
