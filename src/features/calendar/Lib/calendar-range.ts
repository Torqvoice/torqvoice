/**
 * The calendar's date arithmetic, kept free of React and the database so the
 * views can be tested as plain functions.
 *
 * Everything here works on local calendar days. The browser's clock is the
 * workshop's clock for display purposes, the same assumption the work board
 * makes; the server side speaks the workshop's configured zone when it turns
 * instants into day keys (see calendarActions).
 */

export type CalendarView = 'day' | 'fourDays' | 'week' | 'month' | 'year' | 'schedule'

export const CALENDAR_VIEWS: CalendarView[] = [
  'day',
  'week',
  'month',
  'year',
  'schedule',
  'fourDays',
]

export function isCalendarView(value: string | null | undefined): value is CalendarView {
  return CALENDAR_VIEWS.includes(value as CalendarView)
}

/** Format a Date as YYYY-MM-DD in local time (avoids UTC shift from toISOString) */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** YYYY-MM-DD to a local-midnight Date; anything else is null. */
export function parseDateKey(value: string | null | undefined): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

export function addMonths(d: Date, n: number): Date {
  // Clamp the day so Jan 31 + 1 month lands on Feb 28/29, not Mar 3.
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), lastDay))
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function isWeekend(d: Date): boolean {
  const w = d.getDay()
  return w === 0 || w === 6
}

/** The first day of the week `d` sits in, honouring the workshop's week start. */
export function startOfWeek(d: Date, weekStartDay: number): Date {
  const offset = (d.getDay() - weekStartDay + 7) % 7
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -offset)
}

/** ISO 8601 week number, Monday-based regardless of the display setting. */
export function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/**
 * Every day a month grid shows: leading days of the previous month so the
 * first row starts on the week start, and trailing days so the last row is
 * full. Between four and six rows.
 */
export function getMonthGridDays(year: number, month: number, weekStartDay: number): Date[] {
  const first = new Date(year, month, 1)
  const start = startOfWeek(first, weekStartDay)
  const lastDay = new Date(year, month + 1, 0)
  const days: Date[] = []
  for (let d = start; d <= lastDay || days.length % 7 !== 0; d = addDays(d, 1)) {
    days.push(d)
  }
  return days
}

export interface DateRange {
  /** First day shown, inclusive. */
  start: Date
  /** Last day shown, inclusive. */
  end: Date
}

/** The days a view draws around `date`. */
export function visibleRange(view: CalendarView, date: Date, weekStartDay: number): DateRange {
  switch (view) {
    case 'day':
      return { start: date, end: date }
    case 'fourDays':
      return { start: date, end: addDays(date, 3) }
    case 'week': {
      const start = startOfWeek(date, weekStartDay)
      return { start, end: addDays(start, 6) }
    }
    case 'month':
    case 'schedule': {
      const days = getMonthGridDays(date.getFullYear(), date.getMonth(), weekStartDay)
      return { start: days[0], end: days[days.length - 1] }
    }
    case 'year':
      return {
        start: new Date(date.getFullYear(), 0, 1),
        end: new Date(date.getFullYear(), 11, 31),
      }
  }
}

/** Where the previous/next buttons take a view from `date`. */
export function shiftDate(view: CalendarView, date: Date, direction: -1 | 1): Date {
  switch (view) {
    case 'day':
      return addDays(date, direction)
    case 'fourDays':
      return addDays(date, 4 * direction)
    case 'week':
      return addDays(date, 7 * direction)
    case 'month':
    case 'schedule':
      return addMonths(date, direction)
    case 'year':
      return new Date(date.getFullYear() + direction, date.getMonth(), Math.min(date.getDate(), 28))
  }
}

/** Whether `inner` lies entirely inside `outer`, so a loaded window can serve it. */
export function rangeCovers(outer: DateRange | null, inner: DateRange): boolean {
  if (!outer) return false
  return outer.start <= inner.start && outer.end >= inner.end
}

export function eachDay(range: DateRange): Date[] {
  const days: Date[] = []
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) days.push(d)
  return days
}

/** "HH:MM" to minutes from midnight; malformed input is treated as midnight. */
export function timeToMinutes(time: string | null | undefined): number {
  if (!time) return 0
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return Math.max(0, Math.min(24 * 60, h * 60 + m))
}

export function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

/** Minutes a timed event is drawn with when its record carries no end. */
export const DEFAULT_SPAN_MINUTES: Record<string, number> = {
  service: 60,
  message: 30,
  external: 60,
  reminder: 60,
  quote: 60,
}

/** The smallest block the time grid draws, so a two-minute event is still clickable. */
export const MIN_BLOCK_MINUTES = 20

export interface TimedSpan {
  startMins: number
  endMins: number
}

/** Where a timed event sits on its day, in minutes. */
export function eventSpan(event: {
  type: string
  time: string | null
  endTime?: string | null
}): TimedSpan | null {
  if (!event.time) return null
  const startMins = timeToMinutes(event.time)
  const fallback = DEFAULT_SPAN_MINUTES[event.type] ?? 60
  let endMins = event.endTime ? timeToMinutes(event.endTime) : startMins + fallback
  if (endMins <= startMins) endMins = startMins + fallback
  return { startMins, endMins: Math.min(24 * 60, endMins) }
}

export interface PositionedItem<T> {
  item: T
  startMins: number
  endMins: number
  /** Zero-based column within the overlap cluster. */
  column: number
  /** How many columns the cluster spans. */
  columns: number
}

/**
 * Side-by-side layout for events that overlap in time, the way every desktop
 * calendar draws a double booking. Events are grouped into clusters of
 * mutually overlapping items; each cluster is packed greedily into as few
 * columns as fit, and every member is told how wide the cluster is so the
 * columns can share the day's width.
 */
export function layoutTimedEvents<T>(
  items: Array<{ item: T; span: TimedSpan }>,
  minBlock = MIN_BLOCK_MINUTES
): PositionedItem<T>[] {
  const sorted = items
    .map(({ item, span }) => ({
      item,
      startMins: span.startMins,
      endMins: Math.max(span.endMins, span.startMins + minBlock),
    }))
    .sort((a, b) => a.startMins - b.startMins || b.endMins - a.endMins)

  const result: PositionedItem<T>[] = []
  let cluster: PositionedItem<T>[] = []
  let columnEnds: number[] = []
  let clusterEnd = -1

  const flush = () => {
    for (const p of cluster) p.columns = columnEnds.length
    result.push(...cluster)
    cluster = []
    columnEnds = []
    clusterEnd = -1
  }

  for (const entry of sorted) {
    if (cluster.length > 0 && entry.startMins >= clusterEnd) flush()
    let column = columnEnds.findIndex((end) => end <= entry.startMins)
    if (column === -1) {
      column = columnEnds.length
      columnEnds.push(entry.endMins)
    } else {
      columnEnds[column] = entry.endMins
    }
    clusterEnd = Math.max(clusterEnd, entry.endMins)
    cluster.push({ ...entry, column, columns: 1 })
  }
  flush()
  return result
}
