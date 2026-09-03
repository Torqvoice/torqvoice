/**
 * Wall-clock arithmetic in a named timezone, without a library.
 *
 * The server may run in UTC while the workshop lives in Europe/Oslo. Any
 * code that turns "08:00" into an instant, or asks which day an instant
 * falls on, has to say whose clock it means. These helpers take the IANA
 * zone explicitly so the answer is the same on every machine.
 */

export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** 0 = Sunday, as Date#getDay. */
  weekday: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    })
    formatters.set(timeZone, f)
  }
  return f
}

/** What the clock on the wall in `timeZone` shows at `date`. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts: Record<string, string> = {}
  for (const p of formatter(timeZone).formatToParts(date)) parts[p.type] = p.value
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  }
}

/** Offset of `timeZone` from UTC at `date`, in minutes. */
export function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0)
  const truncated = Math.floor(date.getTime() / 60_000) * 60_000
  return Math.round((asUtc - truncated) / 60_000)
}

/**
 * The instant at which the wall clock in `timeZone` reads the given date
 * and time. Two passes settle the offset across a DST change; a time that
 * does not exist on that day resolves to the moment after the gap.
 */
export function zonedDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  let offset = zoneOffsetMinutes(new Date(guess), timeZone)
  let result = guess - offset * 60_000
  const check = zoneOffsetMinutes(new Date(result), timeZone)
  if (check !== offset) {
    offset = check
    result = guess - offset * 60_000
  }
  return new Date(result)
}

/** Midnight at the start of the day `date` falls on in `timeZone`. */
export function startOfZonedDay(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone)
  return zonedDate(p.year, p.month, p.day, 0, 0, timeZone)
}

/** The same wall-clock day, `days` later. */
export function addZonedDays(date: Date, days: number, timeZone: string): Date {
  const p = zonedParts(date, timeZone)
  return zonedDate(p.year, p.month, p.day + days, 0, 0, timeZone)
}

/** "HH:mm" on the day `date` falls on in `timeZone`. */
export function atZonedTime(date: Date, hhmm: string, timeZone: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const p = zonedParts(date, timeZone)
  return zonedDate(
    p.year,
    p.month,
    p.day,
    Number.isFinite(h) ? h : 0,
    Number.isFinite(m) ? m : 0,
    timeZone
  )
}

/** YYYY-MM-DD of the day `date` falls on in `timeZone`. */
export function zonedDayKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function isZonedWeekend(date: Date, timeZone: string): boolean {
  const w = zonedParts(date, timeZone).weekday
  return w === 0 || w === 6
}

/** A zone the runtime accepts, or the fallback when the setting is empty or misspelt. */
export function safeTimeZone(value: string | null | undefined, fallback = 'UTC'): string {
  if (!value) return fallback
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return value
  } catch {
    return fallback
  }
}
