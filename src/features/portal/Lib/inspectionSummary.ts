import type { Condition } from '@/features/inspections/Lib/conditions'

export interface PortalConditionCounts {
  good: number
  fair: number
  poor: number
}

/** Which plain word each graded step is shown under in the portal. */
const PORTAL_BUCKET: Partial<Record<Condition, keyof PortalConditionCounts>> = {
  pass: 'good',
  attention: 'fair',
  fail: 'poor',
  dangerous: 'poor',
}

/**
 * An inspection's results as the customer reads them: good, fair and poor.
 *
 * Items are stored on the app's grading scale (pass, attention, fail and, on
 * the EU scale, dangerous). The portal used to count the stored values under
 * the words themselves, which never match, so every summary came out empty.
 * Dangerous counts as poor; not applicable and not inspected are left out.
 */
export function portalConditionCounts(items: { condition: string }[]): PortalConditionCounts {
  const counts: PortalConditionCounts = { good: 0, fair: 0, poor: 0 }
  for (const item of items) {
    const bucket = PORTAL_BUCKET[item.condition as Condition]
    if (bucket) counts[bucket] += 1
  }
  return counts
}
