import { addMonths, addYears } from 'date-fns'
import { fromZonedWallClock, toZonedWallClock, zonedDateInput } from '@/lib/timezone'

/**
 * Intervals to the next roadworthiness test.
 *
 * Two years is the Union baseline for M1 and N1 vehicles under Article 5 of
 * Directive 2014/45/EU, so it is what the certificate proposes. Several member
 * states test annually and some apply a first-test interval of four years,
 * which is why the others sit one tap away and the date itself stays editable.
 *
 * Every helper takes the workshop's timezone. The card that uses them is
 * rendered on the server and again in the browser, and a test completed late
 * in the evening is a different day in UTC than in Oslo: with the browser's
 * own clock the two renders disagreed on which interval the stored date was,
 * and React refused to hydrate. An empty timezone means the workshop has not
 * chosen one, and then the runtime's clock is all there is.
 */
export const DEFAULT_INTERVAL_MONTHS = 24

export const TEST_INTERVALS: { months: number; label: string; key: string }[] = [
  { months: 6, label: '6 months', key: 'months6' },
  { months: 12, label: '1 year', key: 'years1' },
  { months: 24, label: '2 years', key: 'years2' },
  { months: 36, label: '3 years', key: 'years3' },
  { months: 48, label: '4 years', key: 'years4' },
]

/** The day (yyyy-mm-dd) an instant falls on in the workshop, which is what the date input speaks. */
export function toISODate(value: Date | string | null | undefined, timeZone = ''): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return zonedDateInput(date, timeZone)
}

/**
 * Adds an interval to the date of the test, on the workshop's calendar. Whole
 * years go through addYears so a test on 29 February lands on 28 February
 * rather than drifting a day.
 */
export function addInterval(from: Date, months: number, timeZone = ''): string {
  // A stand-in whose local wall clock is the workshop's, so the calendar
  // arithmetic and the day read back from it are the workshop's too.
  const local = timeZone ? toZonedWallClock(from, timeZone) : from
  const moved = months % 12 === 0 ? addYears(local, months / 12) : addMonths(local, months)
  return zonedDateInput(moved, '')
}

/** The interval a stored date corresponds to, or undefined if it is bespoke. */
export function matchInterval(from: Date, isoDate: string, timeZone = '') {
  return TEST_INTERVALS.find((interval) => addInterval(from, interval.months, timeZone) === isoDate)
}

/** The instant a chosen day stands for: midnight of that day in the workshop. */
export function dueDateInstant(isoDate: string, timeZone = ''): Date {
  const local = new Date(`${isoDate}T00:00:00`)
  return timeZone ? fromZonedWallClock(local, timeZone) : local
}
