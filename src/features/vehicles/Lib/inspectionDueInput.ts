import { zonedDate, zonedDateInput } from '@/lib/timezone'

/**
 * The inspection due date as the vehicle form's date field holds it,
 * YYYY-MM-DD.
 *
 * The stored instant means different things depending on where it came from,
 * so it is read back the way it was written:
 * - A date the workshop typed is saved as midnight on the workshop's clock
 *   (`toSafeWorkshopDate`), so it is read back on that clock. Read as a UTC
 *   day instead, it came back a day early anywhere east of UTC, and every
 *   save of the vehicle moved it another day.
 * - A registry's date is a bare day parsed as UTC midnight, so its UTC day is
 *   the day the registry gave. Read on the workshop's clock it would come back
 *   a day early anywhere west of UTC.
 */
export function inspectionDueInput(
  dueAt: Date | string,
  source: string | null | undefined,
  timeZone: string
): string {
  const date = new Date(dueAt)
  if (Number.isNaN(date.getTime())) return ''
  if (source && source !== 'manual') return date.toISOString().slice(0, 10)
  return zonedDateInput(date, timeZone)
}

/**
 * An inspection date to hand to a date formatter: noon on the right day in
 * the workshop's zone, so the formatter, which works in that zone, prints the
 * day the registry or the workshop meant. Formatting the stored instant
 * itself would print a registry's date a day early anywhere west of UTC.
 * With no workshop zone the formatter uses the browser's, and so does this.
 */
export function inspectionDisplayDate(
  value: Date | string,
  source: string | null | undefined,
  timeZone: string
): Date | null {
  const day = inspectionDueInput(value, source, timeZone)
  if (!day) return null
  const [year, month, date] = day.split('-').map(Number)
  if (!timeZone) return new Date(year, month - 1, date, 12)
  return zonedDate(year, month, date, 12, 0, timeZone)
}
