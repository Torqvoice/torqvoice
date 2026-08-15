import { addMonths, addYears } from 'date-fns'

/**
 * Intervals to the next roadworthiness test.
 *
 * Two years is the Union baseline for M1 and N1 vehicles under Article 5 of
 * Directive 2014/45/EU, so it is what the certificate proposes. Several member
 * states test annually and some apply a first-test interval of four years,
 * which is why the others sit one tap away and the date itself stays editable.
 */
export const DEFAULT_INTERVAL_MONTHS = 24

export const TEST_INTERVALS: { months: number; label: string; key: string }[] = [
  { months: 6, label: '6 months', key: 'months6' },
  { months: 12, label: '1 year', key: 'years1' },
  { months: 24, label: '2 years', key: 'years2' },
  { months: 36, label: '3 years', key: 'years3' },
  { months: 48, label: '4 years', key: 'years4' },
]

/** Local-time ISO date (yyyy-mm-dd), which is what the date input speaks. */
export function toISODate(value: Date | string | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

/**
 * Adds an interval to the date of the test. Whole years go through addYears so
 * a test on 29 February lands on 28 February rather than drifting a day.
 */
export function addInterval(from: Date, months: number): string {
  return toISODate(months % 12 === 0 ? addYears(from, months / 12) : addMonths(from, months))
}

/** The interval a stored date corresponds to, or undefined if it is bespoke. */
export function matchInterval(from: Date, isoDate: string) {
  return TEST_INTERVALS.find((interval) => addInterval(from, interval.months) === isoDate)
}
