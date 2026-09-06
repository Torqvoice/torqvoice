import { zonedDate } from '@/lib/timezone'

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
