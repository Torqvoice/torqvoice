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
