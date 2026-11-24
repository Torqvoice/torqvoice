import {
  type CurrencyFormat,
  currencyDefinition,
  DEFAULT_CURRENCY_CODE,
  DEFAULT_CURRENCY_FORMAT,
} from '@/lib/currencies'
import { zonedParts } from '@/lib/timezone'

export { type CurrencyFormat, DEFAULT_CURRENCY_FORMAT } from '@/lib/currencies'

/**
 * Format a number as currency using the correct locale for the given ISO 4217 currency code.
 *
 * Examples:
 *   formatCurrency(20412.90, "NOK") → "kr 20 412,90"
 *   formatCurrency(1234.56, "USD") → "$1,234.56"
 *   formatCurrency(1234.56, "EUR") → "1.234,56 €"
 */
export function formatCurrency(
  amount: number,
  currencyCode: string = DEFAULT_CURRENCY_CODE,
  format: CurrencyFormat = DEFAULT_CURRENCY_FORMAT
): string {
  const definition = currencyDefinition(currencyCode)
  const locale = definition?.locale || 'en-US'
  // 'code' mode: always render the ISO code.
  // 'symbol' mode: prefer narrowSymbol, but fall back to code for currencies
  // whose symbol isn't WinAnsi-safe in the default PDF font.
  const useCode = format === 'code' || definition?.printCode === true
  const display = useCode ? 'code' : 'narrowSymbol'
  try {
    let result = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: display,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
    const override = definition?.symbol
    if (format === 'symbol' && override) {
      // Replace CLDR's currency token with our override (e.g. ¥ → RMB).
      const parts = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).formatToParts(amount)
      const sym = parts.find((p) => p.type === 'currency')?.value
      if (sym) {
        // If the original symbol was glued to a digit/letter (e.g. "¥1,234.56"),
        // a multi-character override needs a space for readability.
        result = result
          .replace(sym, override)
          .replace(new RegExp(`(${override.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=\\d)`), '$1 ')
      }
    }
    return result
  } catch {
    // Fallback if the currency code is not recognized by Intl
    return `${currencyCode} ${amount.toFixed(2)}`
  }
}

/**
 * Get just the currency symbol for a given ISO 4217 code.
 * Useful for column headers like "Rate (kr/hr)".
 *
 * Examples:
 *   getCurrencySymbol("NOK") → "kr"
 *   getCurrencySymbol("USD") → "$"
 *   getCurrencySymbol("EUR") → "€"
 */
export function getCurrencySymbol(
  currencyCode: string = DEFAULT_CURRENCY_CODE,
  format: CurrencyFormat = DEFAULT_CURRENCY_FORMAT
): string {
  if (format === 'code') return currencyCode
  const definition = currencyDefinition(currencyCode)
  if (definition?.symbol) return definition.symbol
  if (definition?.printCode) return currencyCode
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value || currencyCode
  } catch {
    return currencyCode
  }
}

/**
 * The fields a date pattern prints: the wall clock in `timezone` when one is
 * given, else this runtime's own. Read straight from Intl, never by building
 * a browser-local Date out of them: a local Date cannot hold a wall-clock
 * time that falls in the viewer's own DST gap (02:30 on the night Los
 * Angeles springs forward does not exist there and comes out as 03:30).
 */
interface DateFields {
  year: number
  /** 1 to 12. */
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function fieldsOf(date: Date, timezone?: string): DateFields {
  if (timezone) {
    try {
      const p = zonedParts(date, timezone)
      return {
        year: p.year,
        month: p.month,
        day: p.day,
        hour: p.hour,
        minute: p.minute,
        // No zone in use today is offset by a part of a minute.
        second: date.getUTCSeconds(),
      }
    } catch {
      // A zone this runtime does not know: the runtime's own clock below.
    }
  }
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  }
}

/**
 * Default date format matching the most common existing pattern.
 */
export const DEFAULT_DATE_FORMAT = 'MMM d, yyyy'
export const DEFAULT_TIME_FORMAT = '12h' as const

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const MONTHS_SHORT = MONTHS_LONG.map((name) => name.slice(0, 3))

const monthNames = new Map<string, { long: string[]; short: string[] }>()

/**
 * The month names of a language, from the runtime's own data (every locale
 * the app ships, with no date library to bundle). Without a language, or for
 * one the runtime does not know, the English names the app has always used.
 */
function monthsFor(locale?: string): { long: string[]; short: string[] } {
  if (!locale) return { long: MONTHS_LONG, short: MONTHS_SHORT }
  let names = monthNames.get(locale)
  if (!names) {
    try {
      const name = (month: 'long' | 'short') => {
        // Standalone, not in a date: "november", not a genitive form.
        const f = new Intl.DateTimeFormat(locale, { month, timeZone: 'UTC' })
        return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2000, i, 15))))
      }
      names = { long: name('long'), short: name('short') }
    } catch {
      names = { long: MONTHS_LONG, short: MONTHS_SHORT }
    }
    monthNames.set(locale, names)
  }
  return names
}

/**
 * Simple date-fns-style format function that handles common tokens.
 * Tokens: yyyy, yy, MMMM, MMM, MM, dd, d, HH, hh, mm, ss, a
 */
function formatWithPattern(f: DateFields, pattern: string, locale?: string): string {
  const months = monthsFor(locale)
  const h12 = f.hour % 12 || 12
  const ampm = f.hour < 12 ? 'AM' : 'PM'

  // Use placeholders for month names to avoid collisions with later replacements
  // (e.g. "a" in "May" being replaced by the AM/PM token)
  const MONTH_LONG = '\x01'
  const MONTH_SHORT = '\x02'

  return pattern
    .replace('yyyy', String(f.year))
    .replace('yy', String(f.year).slice(-2))
    .replace('MMMM', MONTH_LONG)
    .replace('MMM', MONTH_SHORT)
    .replace('MM', String(f.month).padStart(2, '0'))
    .replace(/\bdd\b/, String(f.day).padStart(2, '0'))
    .replace(/\bd\b/, String(f.day))
    .replace('HH', String(f.hour).padStart(2, '0'))
    .replace('hh', String(h12).padStart(2, '0'))
    .replace('mm', String(f.minute).padStart(2, '0'))
    .replace('ss', String(f.second).padStart(2, '0'))
    .replace('a', ampm)
    .replace(MONTH_LONG, months.long[f.month - 1])
    .replace(MONTH_SHORT, months.short[f.month - 1])
}

const toDate = (date: Date | string) => (typeof date === 'string' ? new Date(date) : date)

/**
 * Format a date using the org date format and optional timezone. `locale`
 * names the months for a format that spells them ("d MMMM yyyy"); without
 * one they are English.
 */
export function formatDate(
  date: Date | string,
  dateFormat: string = DEFAULT_DATE_FORMAT,
  timezone?: string,
  locale?: string
): string {
  return formatWithPattern(fieldsOf(toDate(date), timezone), dateFormat, locale)
}

/**
 * A calendar day already worked out on the workshop's clock ("2026-11-24",
 * as `zonedDayKey` gives it) in the org date format. No zone is applied: the
 * key is the day, whatever clock formats it. Anything that is not a key is
 * returned as it is.
 */
export function formatDayKey(
  key: string,
  dateFormat: string = DEFAULT_DATE_FORMAT,
  locale?: string
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return key
  const fields = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
  return formatWithPattern({ ...fields, hour: 0, minute: 0, second: 0 }, dateFormat, locale)
}

function timeOf(f: DateFields, timeFormat: '12h' | '24h'): string {
  return formatWithPattern(f, timeFormat === '24h' ? 'HH:mm' : 'hh:mm a')
}

/**
 * Format a date and time using org settings.
 */
export function formatDateTime(
  date: Date | string,
  dateFormat: string = DEFAULT_DATE_FORMAT,
  timeFormat: '12h' | '24h' = '12h',
  timezone?: string,
  locale?: string
): string {
  const f = fieldsOf(toDate(date), timezone)
  return `${formatWithPattern(f, dateFormat, locale)} ${timeOf(f, timeFormat)}`
}

/**
 * Format time only using org settings.
 */
export function formatTime(
  date: Date | string,
  timeFormat: '12h' | '24h' = '12h',
  timezone?: string
): string {
  return timeOf(fieldsOf(toDate(date), timezone), timeFormat)
}

/**
 * Format a date for server-side PDF/invoice rendering.
 * Applies timezone if provided, otherwise the runtime's own clock.
 */
export function formatDateForPdf(
  date: Date | string,
  dateFormat: string = DEFAULT_DATE_FORMAT,
  timezone?: string,
  locale?: string
): string {
  return formatDate(date, dateFormat, timezone, locale)
}
