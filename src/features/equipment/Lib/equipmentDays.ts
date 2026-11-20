/**
 * Days on a piece of equipment: made, installed, last examined, next
 * examination due. Each is a calendar day as it is written on the plate or
 * the certificate, not a moment, so it is held as a day key ("2026-11-20")
 * everywhere outside the database, where it is a `date` column. A day has no
 * time zone: converting one through a clock would move it.
 */

import { parseDateText, toISODate } from '@/lib/parse-date-text'

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Whether a text is a real calendar day ("2026-02-30" is not). */
export function isDayKey(value: string): boolean {
  const match = DAY.exec(value)
  if (!match) return false
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** A day key as the database's `date` column takes it: that day at UTC midnight. */
export function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

/**
 * A `date` column back as its day key. The column comes back at UTC
 * midnight, so its UTC date is the day itself, on any server clock.
 */
export function dateToDay(date: Date | null | undefined): string | null {
  if (!date) return null
  return date.toISOString().slice(0, 10)
}

export const MIN_MANUFACTURE_YEAR = 1900

/**
 * When an item was made, as the plate gives it: a year alone ("2019") or a
 * full day. The day is ISO ("2019-05-14") or, given the workshop's date
 * format, written the workshop's way ("14/05/2019", "05/14/2019",
 * "14.05.2019"), read as the date fields read it. A month and year alone
 * ("03/2019") is not one of them, nor is a month name. Anything else is
 * null. A year in the future is refused by the caller, which knows today on
 * the workshop's clock.
 */
export function parseManufacture(
  typed: string,
  dateFormat?: string
): { year: number; day: string | null } | null {
  const text = typed.trim()
  if (/^\d{4}$/.test(text)) {
    const year = Number(text)
    return year >= MIN_MANUFACTURE_YEAR ? { year, day: null } : null
  }
  let day = isDayKey(text) ? text : null
  // A day, a month and a year: in figures ("14/05/2019"), or with the month
  // named ("May 14, 2019", for a workshop that writes dates so). A month and
  // year alone never reads as a date here, though the date parser would take
  // "March 2019" as its first day.
  if (!day && dateFormat && hasDayMonthYear(text)) {
    const parsed = parseDateText(text, dateFormat)
    day = parsed ? toISODate(parsed) : null
  }
  if (!day) return null
  const year = Number(day.slice(0, 4))
  return year >= MIN_MANUFACTURE_YEAR ? { year, day } : null
}

/** Three numbers, or a day and a year around a month's name. */
function hasDayMonthYear(text: string): boolean {
  if (/^\d{1,2}[./\-\s]\d{1,2}[./\-\s](\d{2}|\d{4})$/.test(text)) return true
  const numbers = text.match(/\d+/g) ?? []
  return (
    /\p{L}{3,}/u.test(text) &&
    numbers.length === 2 &&
    numbers.some((n) => n.length <= 2) &&
    numbers.some((n) => n.length === 4)
  )
}

/** The manufacture field's value as the server takes it: the year, or the ISO day. */
export function manufactureValue(typed: string, dateFormat: string): string {
  if (typed.trim() === '') return ''
  const made = parseManufacture(typed, dateFormat)
  return made ? (made.day ?? String(made.year)) : typed.trim()
}

/** What the manufacture field shows when an item is edited: the day, or the year alone. */
export function manufactureText(item: {
  manufactureYear: number | null
  manufactureDay: string | null
}): string {
  if (item.manufactureDay) return item.manufactureDay
  return item.manufactureYear ? String(item.manufactureYear) : ''
}

/**
 * Where an examination stands on a given workshop day: overdue once its day
 * has passed, due soon within `soonDays`, otherwise fine.
 */
export function examinationState(
  due: string | null,
  today: string,
  soonDays = 30
): 'overdue' | 'soon' | 'ok' | null {
  if (!due) return null
  if (due < today) return 'overdue'
  const limit = new Date(dayToDate(today).getTime() + soonDays * 86_400_000)
  return due <= dateToDay(limit)! ? 'soon' : 'ok'
}
