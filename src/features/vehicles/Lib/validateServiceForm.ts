/**
 * What has to be true before a work order can be saved.
 *
 * Two of these exist because the editor cannot lean on the browser's own form
 * validation: the page draws every field twice, once for each breakpoint, and
 * a `min` or `required` broken in the copy this screen is not using blocks the
 * submit with a message the browser then cannot show, because it will not
 * focus a hidden control. So the form is submitted unvalidated and checked
 * here, where a refusal can be explained.
 *
 * Pure, and separate from the editor, so the rules can be read and tested
 * without a browser.
 */

export type ServiceFormProblem =
  | 'title'
  | 'negative'
  /** A part priced or numbered but never named. */
  | 'partName'
  /** Labour with hours or a rate but nothing said about it. */
  | 'laborDescription'

export interface ServiceFormPart {
  name: string
  partNumber?: string | null
  quantity: number | string
  unitCost?: number | string | null
  unitPrice: number | string
  markupPercent?: number | string | null
}

export interface ServiceFormLabor {
  description: string
  hours: number | string
  rate: number | string
}

export interface ServiceFormInput {
  title: string
  partItems: ServiceFormPart[]
  laborItems: ServiceFormLabor[]
}

function num(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * A row somebody has started. An untouched blank row is not a mistake; it is
 * the line the editor leaves ready, and it is dropped on save without comment.
 * These are the marks that say a row was meant.
 */
export function partRowHasContent(part: ServiceFormPart): boolean {
  return Boolean(part.partNumber) || num(part.unitCost) > 0 || num(part.unitPrice) > 0
}

export function laborRowHasContent(labor: ServiceFormLabor): boolean {
  return num(labor.hours) > 0 || num(labor.rate) > 0
}

/**
 * The first thing wrong with the form, or null when it can be saved. First,
 * because one clear sentence is worth more than a list nobody reads, and
 * fixing it brings the next one up.
 */
export function findServiceFormProblem(input: ServiceFormInput): ServiceFormProblem | null {
  if (!input.title.trim()) return 'title'

  // Money and time only run one way. A negative here is a typo or a minus
  // sign left in the field, and it reaches the totals before it reaches the
  // save, so the editor can already be showing a negative invoice.
  const negativePart = input.partItems.some(
    (p) =>
      num(p.quantity) < 0 ||
      num(p.unitCost) < 0 ||
      num(p.unitPrice) < 0 ||
      // Below cost is a real decision; below giving it away is not.
      num(p.markupPercent) < -100
  )
  const negativeLabor = input.laborItems.some((l) => num(l.hours) < 0 || num(l.rate) < 0)
  if (negativePart || negativeLabor) return 'negative'

  // A row with a price and no name used to be dropped on save without a word,
  // taking its money off the invoice. The workshop finds out when the
  // customer's total is short.
  if (input.partItems.some((p) => !p.name.trim() && partRowHasContent(p))) return 'partName'
  if (input.laborItems.some((l) => !l.description.trim() && laborRowHasContent(l))) {
    return 'laborDescription'
  }

  return null
}
