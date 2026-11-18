import type { ServicePartInput } from '@/features/vehicles/Schema/serviceSchema'

/**
 * What a job gained in parts while a page was open: a part a technician
 * scanned onto it from the app, say.
 *
 * Parts save the way labour does, by replacing the lot, so a saved row carries
 * no id the page could match on. The comparison is by content and by count,
 * the same as addedLaborLines, so a second identical part still reads as one
 * part added.
 */

const key = (part: ServicePartInput) =>
  JSON.stringify([
    part.name,
    part.partNumber ?? null,
    part.quantity,
    part.unitPrice,
    part.total,
    part.inventoryPartId ?? null,
  ])

export function addedPartLines(
  before: readonly ServicePartInput[],
  after: readonly ServicePartInput[]
): ServicePartInput[] {
  const remaining = new Map<string, number>()
  for (const part of before) {
    const k = key(part)
    remaining.set(k, (remaining.get(k) ?? 0) + 1)
  }
  const added: ServicePartInput[] = []
  for (const part of after) {
    const k = key(part)
    const left = remaining.get(k) ?? 0
    if (left > 0) remaining.set(k, left - 1)
    else added.push(part)
  }
  return added
}
