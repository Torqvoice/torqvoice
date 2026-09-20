import type { ServiceLaborInput } from '@/features/vehicles/Schema/serviceSchema'

/**
 * What a job gained in lines of work while a page was open.
 *
 * A work order saves its labour by replacing the lot, so the rows carry no id
 * the page could match on: a line is only what it says. The comparison is
 * therefore by content, and by count, so a second identical line (two hours
 * booked twice) still reads as one line added.
 */

const key = (line: ServiceLaborInput) =>
  JSON.stringify([line.description, line.hours, line.rate, line.total, line.pricingType])

export function addedLaborLines(
  before: readonly ServiceLaborInput[],
  after: readonly ServiceLaborInput[]
): ServiceLaborInput[] {
  const remaining = new Map<string, number>()
  for (const line of before) {
    const k = key(line)
    remaining.set(k, (remaining.get(k) ?? 0) + 1)
  }
  const added: ServiceLaborInput[] = []
  for (const line of after) {
    const k = key(line)
    const left = remaining.get(k) ?? 0
    if (left > 0) remaining.set(k, left - 1)
    else added.push(line)
  }
  return added
}
