import { isDefect } from './conditions'

/**
 * What an inspection turns into when it becomes a quote or a work order.
 *
 * Both open with a line for the inspection itself, so a car that passed can
 * still be billed, and then one line per check that was not OK: dangerous
 * first, then major, then minor, the order the work should be done in, and in
 * checklist order within a grade.
 */

const SEVERITY_ORDER: Record<string, number> = { dangerous: 0, fail: 1, attention: 2 }

/** Every check that was not OK, worst first. */
export function defectsWorstFirst<T extends { condition: string; sortOrder: number }>(
  items: T[]
): T[] {
  return items
    .filter((item) => isDefect(item.condition))
    .sort(
      (a, b) =>
        (SEVERITY_ORDER[a.condition] ?? 9) - (SEVERITY_ORDER[b.condition] ?? 9) ||
        a.sortOrder - b.sortOrder
    )
}

/** The line a defect becomes: the check that found it and what the technician wrote. */
export function defectLineText(item: {
  code?: string | null
  name: string
  notes?: string | null
}): string {
  return [item.code ? `${item.code} ${item.name}` : item.name, item.notes?.trim()]
    .filter(Boolean)
    .join(': ')
}
