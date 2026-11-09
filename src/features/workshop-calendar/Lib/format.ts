/**
 * Calendar dates for people to read. A date key is formatted at noon UTC in
 * UTC, so it names the same day in every browser and on the server.
 */

const cache = new Map<string, Intl.DateTimeFormat>()

function formatter(locale: string, withYear: boolean, withWeekday: boolean): Intl.DateTimeFormat {
  const id = `${locale}|${withYear}|${withWeekday}`
  let f = cache.get(id)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
      ...(withWeekday ? { weekday: 'short' } : {}),
    })
    cache.set(id, f)
  }
  return f
}

const noon = (key: string) => new Date(`${key}T12:00:00Z`)

/** "Fri 25 Dec 2026", or without the year or weekday. */
export function formatDay(
  key: string,
  locale: string,
  opts: { year?: boolean; weekday?: boolean } = {}
): string {
  return formatter(locale, opts.year ?? true, opts.weekday ?? false).format(noon(key))
}

/** One day, or a range of days the way the locale writes ranges. */
export function formatDays(
  start: string,
  end: string,
  locale: string,
  opts: { year?: boolean; weekday?: boolean } = {}
): string {
  const f = formatter(locale, opts.year ?? true, opts.weekday ?? false)
  if (start === end) return f.format(noon(start))
  const range = (f as Intl.DateTimeFormat & { formatRange?: (a: Date, b: Date) => string })
    .formatRange
  return range
    ? range.call(f, noon(start), noon(end))
    : `${f.format(noon(start))} - ${f.format(noon(end))}`
}

/** A weekday's name: 0 is Sunday. */
export function weekdayName(
  weekday: number,
  locale: string,
  style: 'long' | 'short' = 'long'
): string {
  // 1 January 2023 was a Sunday.
  const day = new Date(Date.UTC(2023, 0, 1 + weekday, 12))
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(day)
}

/** A country's name in the reader's language, or its code when the runtime has none. */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/** "AU-QLD" as "QLD": the part a person in that country knows. */
export function regionLabel(code: string): string {
  return code.includes('-') ? code.slice(code.indexOf('-') + 1) : code
}
