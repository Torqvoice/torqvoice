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

/**
 * A part as the server hands it back after a save. The editor holds what is
 * typed (numbers as the strings in the boxes) and a preset's part carries an
 * empty part number and inventory link where the page's own rows carry none;
 * the save coerces both, and the refresh after it brings back numbers. Both
 * sides of every comparison go through this, so a part the page has just
 * saved is never read as a different one.
 */
export function savedPartShape(part: ServicePartInput): ServicePartInput {
  return {
    ...part,
    partNumber: part.partNumber || '',
    quantity: Number(part.quantity) || 0,
    unitPrice: Number(part.unitPrice) || 0,
    total: Number(part.total) || 0,
    inventoryPartId: part.inventoryPartId || undefined,
  }
}

const key = (part: ServicePartInput) => {
  const saved = savedPartShape(part)
  return JSON.stringify([
    saved.name,
    saved.partNumber,
    saved.quantity,
    saved.unitPrice,
    saved.total,
    saved.inventoryPartId ?? null,
  ])
}

export function addedPartLines(
  before: readonly ServicePartInput[],
  after: readonly ServicePartInput[],
  /** What a save still on its way sent; see addedLaborLines. */
  sending?: readonly ServicePartInput[]
): ServicePartInput[] {
  const remaining = counts(before)
  if (sending) {
    for (const [k, n] of counts(sending)) remaining.set(k, Math.max(remaining.get(k) ?? 0, n))
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

function counts(parts: readonly ServicePartInput[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const part of parts) {
    const k = key(part)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return map
}
