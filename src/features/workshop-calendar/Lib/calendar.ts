import { zonedDate, zonedDayKey } from '@/lib/timezone'

/**
 * When the workshop is open, and who is away: the one set of rules the work
 * board, the scheduler, online booking and the portal all read.
 *
 * Pure: the caller loads the settings and rows (see loadCalendar.server.ts)
 * and passes them in. Days are calendar dates ("2026-12-25") on the
 * workshop's own calendar, and only become instants when a time of day is put
 * on them in the workshop's zone, so a holiday never moves because the server
 * runs in UTC.
 */

/** One weekday's hours, "HH:mm" on the workshop's clock. */
export interface DayHours {
  open: boolean
  start: string
  end: string
}

/** Sunday first, as Date#getDay. */
export type WeekHours = DayHours[]

export type ClosureSource = 'closure' | 'holiday' | 'feed'

/** A stretch the whole workshop is closed. */
export interface ClosedPeriod {
  /** What to call it: "Christmas Day", "Staff training". */
  name: string
  source: ClosureSource
  /** First and last day, both included. */
  startDate: string
  endDate: string
  /** On the first day, closed from this time; null from the start of the day. */
  startTime?: string | null
  /** On the last day, closed until this time; null to the end of the day. */
  endTime?: string | null
}

export const ABSENCE_REASONS = ['holiday', 'sick', 'training', 'other'] as const
export type AbsenceReason = (typeof ABSENCE_REASONS)[number]

/** A technician away for a stretch. Same day and time rules as a closure. */
export interface Absence {
  id: string
  technicianId: string
  startDate: string
  endDate: string
  startTime?: string | null
  endTime?: string | null
  reason: AbsenceReason | string
  note?: string | null
}

export interface WorkshopCalendar {
  timeZone: string
  week: WeekHours
  /** Already resolved to real dates: a yearly closure appears once per year. */
  closures: ClosedPeriod[]
  absences: Absence[]
}

export interface Interval {
  start: Date
  end: Date
}

export const DEFAULT_DAY_START = '07:00'
export const DEFAULT_DAY_END = '15:00'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export function isTime(value: unknown): value is string {
  return typeof value === 'string' && TIME.test(value)
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const back = new Date(Date.UTC(y, m - 1, d))
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d
}

// ─── Opening hours ───────────────────────────────────────────────────────────

/**
 * The week a workshop had before it could set hours per day: one pair of
 * times on weekdays, and weekends only when it said so.
 */
export function defaultWeek(
  start = DEFAULT_DAY_START,
  end = DEFAULT_DAY_END,
  includeWeekends = false
): WeekHours {
  return Array.from({ length: 7 }, (_, weekday) => ({
    open: includeWeekends || (weekday >= 1 && weekday <= 5),
    start,
    end,
  }))
}

/**
 * The stored week, or the legacy pair when nothing usable is stored. A day
 * whose times are missing or back to front keeps the fallback's times, so a
 * bad value can close a day but never open it at a nonsensical hour.
 */
export function parseWeekHours(raw: string | null | undefined, fallback: WeekHours): WeekHours {
  if (!raw) return fallback
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fallback
  }
  if (!Array.isArray(parsed) || parsed.length !== 7) return fallback
  return parsed.map((day, weekday) => {
    const base = fallback[weekday]
    if (!day || typeof day !== 'object') return base
    const d = day as Partial<DayHours>
    const start = isTime(d.start) ? d.start : base.start
    const end = isTime(d.end) ? d.end : base.end
    const sane = minutesOf(start) < minutesOf(end)
    return {
      open: Boolean(d.open) && sane,
      start: sane ? start : base.start,
      end: sane ? end : base.end,
    }
  })
}

/** "08:30" as 510. */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** The earliest opening and latest closing across the week, for drawing a day. */
export function weekSpan(week: WeekHours): { start: string; end: string } {
  const open = week.filter((d) => d.open)
  const days = open.length > 0 ? open : week
  const start = days.reduce((a, d) => (minutesOf(d.start) < minutesOf(a) ? d.start : a), '23:59')
  const end = days.reduce((a, d) => (minutesOf(d.end) > minutesOf(a) ? d.end : a), '00:00')
  return { start, end }
}

// ─── Calendar dates ──────────────────────────────────────────────────────────

function partsOf(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number)
  return [y, m, d]
}

/** The day `days` after `key` ("2026-12-31" + 1 is "2027-01-01"). */
export function addDays(key: string, days: number): string {
  const [y, m, d] = partsOf(key)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** 0 = Sunday. */
export function weekdayOf(key: string): number {
  const [y, m, d] = partsOf(key)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = partsOf(a)
  const [by, bm, bd] = partsOf(b)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** Every day from `from` to `to`, both included. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let key = from; key <= to; key = addDays(key, 1)) out.push(key)
  return out
}

/** The instant the workshop's clock reads `hhmm` on `key`. */
export function instantAt(key: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = partsOf(key)
  const [h, min] = hhmm.split(':').map(Number)
  return zonedDate(y, m, d, h, min, timeZone)
}

/** The workshop's midnight at the start of `key`. */
export function startOfDay(key: string, timeZone: string): Date {
  return instantAt(key, '00:00', timeZone)
}

/** The calendar date an instant falls on for the workshop. */
export function dayOf(instant: Date, timeZone: string): string {
  return zonedDayKey(instant, timeZone)
}

/** A date stored as a Prisma `@db.Date` (UTC midnight) as "YYYY-MM-DD". */
export function dateKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * The same dates in another year. 29 February becomes the 28th in a year
 * without it, rather than spilling into March.
 */
export function inYear(key: string, year: number): string {
  const [, m, d] = partsOf(key)
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate()
  return `${year}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/**
 * A closure that repeats every year, once for each year from `fromYear` to
 * `toYear`. A stretch over New Year keeps its length: 24 December to
 * 2 January is still ten days.
 */
export function repeatYearly(
  period: ClosedPeriod,
  fromYear: number,
  toYear: number
): ClosedPeriod[] {
  const length = daysBetween(period.startDate, period.endDate)
  const out: ClosedPeriod[] = []
  for (let year = fromYear; year <= toYear; year++) {
    const startDate = inYear(period.startDate, year)
    out.push({ ...period, startDate, endDate: addDays(startDate, length) })
  }
  return out
}

// ─── Closed and open time ────────────────────────────────────────────────────

/** What part of `key` a stretch with these dates and times covers. */
export function windowOn(
  key: string,
  stretch: Pick<ClosedPeriod, 'startDate' | 'endDate' | 'startTime' | 'endTime'>,
  timeZone: string
): Interval | null {
  if (key < stretch.startDate || key > stretch.endDate) return null
  const start =
    key === stretch.startDate && stretch.startTime
      ? instantAt(key, stretch.startTime, timeZone)
      : startOfDay(key, timeZone)
  const end =
    key === stretch.endDate && stretch.endTime
      ? instantAt(key, stretch.endTime, timeZone)
      : startOfDay(addDays(key, 1), timeZone)
  return end > start ? { start, end } : null
}

/** The whole stretch as one interval, from its first moment to its last. */
export function spanOf(
  stretch: Pick<ClosedPeriod, 'startDate' | 'endDate' | 'startTime' | 'endTime'>,
  timeZone: string
): Interval {
  const start = stretch.startTime
    ? instantAt(stretch.startDate, stretch.startTime, timeZone)
    : startOfDay(stretch.startDate, timeZone)
  const end = stretch.endTime
    ? instantAt(stretch.endDate, stretch.endTime, timeZone)
    : startOfDay(addDays(stretch.endDate, 1), timeZone)
  return { start, end }
}

/**
 * The same holiday from two sources (the country's list and a calendar, say)
 * is one closure: the first is kept, so a name is never said twice.
 */
function oncePerName(periods: ClosedPeriod[]): ClosedPeriod[] {
  const seen = new Set<string>()
  return periods.filter((p) => {
    const id = `${p.name.toLocaleLowerCase()}|${p.startTime ?? ''}|${p.endTime ?? ''}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/** Closures touching `key`, in the order given, each name once. */
export function closuresOn(cal: WorkshopCalendar, key: string): ClosedPeriod[] {
  return oncePerName(cal.closures.filter((c) => key >= c.startDate && key <= c.endDate))
}

/** The weekday's hours as instants on `key`, or null on a closed weekday. */
export function hoursOn(cal: WorkshopCalendar, key: string): Interval | null {
  const day = cal.week[weekdayOf(key)]
  if (!day?.open) return null
  return {
    start: instantAt(key, day.start, cal.timeZone),
    end: instantAt(key, day.end, cal.timeZone),
  }
}

/** `base` with each of `cuts` taken out of it. */
export function subtract(base: Interval[], cuts: Interval[]): Interval[] {
  let pieces = base
  for (const cut of cuts) {
    const next: Interval[] = []
    for (const piece of pieces) {
      if (cut.end <= piece.start || cut.start >= piece.end) {
        next.push(piece)
        continue
      }
      if (cut.start > piece.start) next.push({ start: piece.start, end: cut.start })
      if (cut.end < piece.end) next.push({ start: cut.end, end: piece.end })
    }
    pieces = next
  }
  return pieces
}

/** When the workshop is open on `key`: its hours less any closure that day. */
export function openIntervalsOn(cal: WorkshopCalendar, key: string): Interval[] {
  const hours = hoursOn(cal, key)
  if (!hours) return []
  const cuts = closuresOn(cal, key)
    .map((c) => windowOn(key, c, cal.timeZone))
    .filter((w): w is Interval => w !== null)
  return subtract([hours], cuts)
}

export interface DayState {
  /** Open at some point in the day. */
  open: boolean
  /** Why it is closed or shortened, when it is. */
  closures: ClosedPeriod[]
  /** Closed because the workshop does not open on this weekday. */
  closedWeekday: boolean
  /** Open, but for less than its usual hours. */
  shortened: boolean
  intervals: Interval[]
}

/** Everything the screens need to know about one day. */
export function dayState(cal: WorkshopCalendar, key: string): DayState {
  const hours = hoursOn(cal, key)
  const closures = closuresOn(cal, key)
  const intervals = openIntervalsOn(cal, key)
  const usual = hours ? hours.end.getTime() - hours.start.getTime() : 0
  const actual = intervals.reduce((sum, i) => sum + i.end.getTime() - i.start.getTime(), 0)
  return {
    open: intervals.length > 0,
    closures,
    closedWeekday: !hours,
    shortened: intervals.length > 0 && actual < usual,
    intervals,
  }
}

/** Whether the whole of start-to-end falls in one open stretch. */
export function isOpenFor(cal: WorkshopCalendar, start: Date, end: Date): boolean {
  const key = dayOf(start, cal.timeZone)
  return openIntervalsOn(cal, key).some((i) => start >= i.start && end <= i.end)
}

/** The closures that overlap start-to-end, for naming them in a warning. */
export function closuresDuring(cal: WorkshopCalendar, start: Date, end: Date): ClosedPeriod[] {
  return oncePerName(
    cal.closures.filter((c) => {
      const span = spanOf(c, cal.timeZone)
      return span.start < end && span.end > start
    })
  )
}

// ─── Technicians away ────────────────────────────────────────────────────────

/** The absences of `technicianId` that overlap start-to-end. */
export function absencesDuring(
  cal: WorkshopCalendar,
  technicianId: string,
  start: Date,
  end: Date
): Absence[] {
  return cal.absences.filter((a) => {
    if (a.technicianId !== technicianId) return false
    const span = spanOf(a, cal.timeZone)
    return span.start < end && span.end > start
  })
}

/** The absences touching `key`, for every technician or one. */
export function absencesOn(cal: WorkshopCalendar, key: string, technicianId?: string): Absence[] {
  return cal.absences.filter(
    (a) =>
      key >= a.startDate &&
      key <= a.endDate &&
      (technicianId === undefined || a.technicianId === technicianId)
  )
}

/** Whether the absence takes the whole of the technician's working day `key`. */
export function awayAllDay(cal: WorkshopCalendar, absence: Absence, key: string): boolean {
  const window = windowOn(key, absence, cal.timeZone)
  if (!window) return false
  const hours = hoursOn(cal, key)
  if (!hours) return !absence.startTime && !absence.endTime
  return window.start <= hours.start && window.end >= hours.end
}
