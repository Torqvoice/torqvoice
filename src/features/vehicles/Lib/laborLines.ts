import { roundMoney } from '@/lib/money'
import type { ServiceLaborInput } from '@/features/vehicles/Schema/serviceSchema'
import { isShopFeeLine } from '@/features/settings/Lib/shopFee'

/**
 * What a job gained in lines of work while a page was open.
 *
 * A work order saves its labour by replacing the lot, so the rows carry no id
 * the page could match on: a line is only what it says. The comparison is
 * therefore by content, and by count, so a second identical line (two hours
 * booked twice) still reads as one line added.
 */

/**
 * A line as the server hands it back after a save. The editor holds what is
 * typed (hours and rate as the strings in the boxes, the pricing type left
 * out on an old row); the save coerces them, and the refresh after it brings
 * back numbers. Both sides of every comparison go through this, so a line the
 * page has just saved is never read as a different one.
 */
export function savedLaborShape(line: ServiceLaborInput): ServiceLaborInput {
  return {
    ...line,
    hours: Number(line.hours) || 0,
    rate: Number(line.rate) || 0,
    // Held to the cent, as the save stores it (serviceSchema), so a total the
    // page worked out with float noise matches the one the refresh brings back.
    total: roundMoney(line.total),
    pricingType: line.pricingType || 'hourly',
  }
}

const key = (line: ServiceLaborInput) => {
  const saved = savedLaborShape(line)
  return JSON.stringify([
    saved.description,
    saved.hours,
    saved.rate,
    saved.total,
    saved.pricingType,
  ])
}

export function addedLaborLines(
  before: readonly ServiceLaborInput[],
  after: readonly ServiceLaborInput[],
  /**
   * What a save still on its way sent. A read of the job can land either side
   * of that save's write, so a line counts as added only if it is new against
   * both: the page's own edit coming back is not somebody else's work.
   */
  sending?: readonly ServiceLaborInput[]
): ServiceLaborInput[] {
  const remaining = counts(before)
  if (sending) {
    for (const [k, n] of counts(sending)) remaining.set(k, Math.max(remaining.get(k) ?? 0, n))
  }
  const added: ServiceLaborInput[] = []
  for (const line of after) {
    if (isShopFeeLine(line)) continue
    const k = key(line)
    const left = remaining.get(k) ?? 0
    if (left > 0) remaining.set(k, left - 1)
    else added.push(line)
  }
  return added
}

function counts(lines: readonly ServiceLaborInput[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const line of lines) {
    const k = key(line)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return map
}
