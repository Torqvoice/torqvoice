import { addZonedDays, startOfZonedDay, zonedDate, zonedParts } from '@/lib/timezone'

/**
 * A "YYYY-MM-DDTHH:MM" from the schedule dialog is the workshop's wall
 * clock, not the server's. Parsed with `new Date` on a box running in UTC,
 * a message set for 18:00 in Oslo went out at 20:00. A date alone is that
 * day's midnight in the workshop; a string carrying its own zone or offset
 * is taken as it is.
 */
export function parseWorkshopDateTime(value: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim())
  const date = m
    ? zonedDate(
        Number(m[1]),
        Number(m[2]),
        Number(m[3]),
        m[4] ? Number(m[4]) : 0,
        m[5] ? Number(m[5]) : 0,
        timeZone
      )
    : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid send time')
  return date
}

/**
 * The same, for optional form input: empty, malformed or absurd values come
 * back as undefined instead of throwing, the way toSafeDate behaves.
 */
export function toSafeWorkshopDate(
  value: string | null | undefined,
  timeZone: string
): Date | undefined {
  if (!value) return undefined
  try {
    const date = parseWorkshopDateTime(value, timeZone)
    const year = date.getUTCFullYear()
    return year >= 1900 && year <= 2100 ? date : undefined
  } catch {
    return undefined
  }
}

/**
 * The last instant of the day `value` names in the workshop, for things
 * that are valid "until the 7th": the whole of the 7th, not its first
 * second. Undefined for empty or malformed input.
 */
export function endOfWorkshopDay(
  value: string | null | undefined,
  timeZone: string
): Date | undefined {
  const start = toSafeWorkshopDate(value, timeZone)
  if (!start) return undefined
  return new Date(addZonedDays(startOfZonedDay(start, timeZone), 1, timeZone).getTime() - 1)
}

/**
 * A Prisma window covering whole workshop days from `startKey` to `endKey`
 * inclusive, as `{ gte, lt }`. Both keys are YYYY-MM-DD; a bad or missing
 * key falls back to the given default instant.
 */
export function workshopDayRange(
  startKey: string | null | undefined,
  endKey: string | null | undefined,
  timeZone: string,
  fallback: { start: Date; end: Date }
): { gte: Date; lt: Date } {
  const start = toSafeWorkshopDate(startKey, timeZone) ?? fallback.start
  const endDay = toSafeWorkshopDate(endKey, timeZone) ?? fallback.end
  return {
    gte: startOfZonedDay(start, timeZone),
    lt: addZonedDays(startOfZonedDay(endDay, timeZone), 1, timeZone),
  }
}

/**
 * Wall-clock arithmetic: the same time of day, `days`/`months`/`years`
 * later on the workshop's clock. Plain `setDate`/`setMonth` on the server
 * keeps the UTC time of day instead, so a daily 18:00 message drifts an
 * hour at every DST change. Month steps clamp the day the way people
 * expect: 31 Jan plus a month is 28 Feb.
 */
export function shiftWorkshopTime(
  date: Date,
  by: { days?: number; months?: number; years?: number },
  timeZone: string
): Date {
  const p = zonedParts(date, timeZone)
  const year = p.year + (by.years ?? 0)
  const monthIndex = p.month - 1 + (by.months ?? 0)
  const first = new Date(Date.UTC(year, monthIndex, 1))
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate()
  const day = Math.min(p.day, lastDay) + (by.days ?? 0)
  return zonedDate(first.getUTCFullYear(), first.getUTCMonth() + 1, day, p.hour, p.minute, timeZone)
}

/** YYYY-MM of the workshop's month an instant falls in, for monthly buckets. */
export function workshopMonthKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}
