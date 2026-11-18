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

/**
 * The counts worth showing, in reading order, each with how loudly to say it.
 * The portal theme's variables only: good is quiet, fair is plain text, poor
 * is the theme's warning colour, so the summary reads right in every portal
 * theme, the dark one included. Zero counts are left out.
 */
export function portalConditionSummary(
  items: { condition: string }[]
): { key: keyof PortalConditionCounts; count: number; className: string }[] {
  const counts = portalConditionCounts(items)
  const tone: Record<keyof PortalConditionCounts, string> = {
    good: 'p-muted',
    fair: 'p-ink font-medium',
    poor: 'font-semibold text-[color:var(--p-danger)]',
  }
  return (['poor', 'fair', 'good'] as const)
    .filter((key) => counts[key] > 0)
    .map((key) => ({ key, count: counts[key], className: tone[key] }))
}
