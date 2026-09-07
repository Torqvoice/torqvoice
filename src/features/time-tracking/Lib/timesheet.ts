import { addZonedDays, startOfZonedDay, zonedDayKey } from '@/lib/timezone'

/**
 * Arithmetic for the timesheet, shared by the page and its tests.
 *
 * Nothing here touches the database or React. The server hands the page raw
 * entries and the workshop's timezone; the page runs these against a ticking
 * `now`, so a clock that is still running grows on screen without another
 * round trip. Day boundaries are the workshop's, never the browser's: a
 * manager in another country reading the sheet must see the same days the
 * technician worked.
 */

/** One stretch as it travels to the browser: instants as ISO strings. */
export interface SheetEntry {
  id: string
  startedAt: string
  endedAt: string | null
  durationMinutes: number | null
  note: string | null
  source: string
  editedAt: string | null
  editedByName: string | null
  technicianId: string
  technicianName: string
  technicianColor: string
  job: {
    id: string
    title: string
    status: string
    vehicleId: string | null
    vehicleLabel: string | null
    licensePlate: string | null
  }
}

export interface SheetTechnician {
  id: string
  name: string
  color: string
  /** False for a board-only row nobody has linked to an account. */
  linked?: boolean
}

/** Minutes between two instants, rounded, never negative. */
export function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000))
}

/** When the entry ends for display purposes: its stop, or right now while it runs. */
export function effectiveEnd(entry: Pick<SheetEntry, 'endedAt'>, now: Date): Date {
  return entry.endedAt ? new Date(entry.endedAt) : now
}

/** Live minutes for an entry, counting a running one up to `now`. */
export function entryMinutes(entry: SheetEntry, now: Date): number {
  if (entry.endedAt && entry.durationMinutes !== null) return entry.durationMinutes
  return minutesBetween(new Date(entry.startedAt), effectiveEnd(entry, now))
}

export interface DaySlice {
  dayKey: string
  minutes: number
}

/**
 * Cut one entry into the workshop days it touches, clipped to a window.
 *
 * A stretch from 22:00 to 02:00 is two hours on one sheet and two on the
 * next, not four on the day it started. Most entries fall inside a single
 * day and come back as one slice.
 */
export function sliceByDay(
  entry: SheetEntry,
  timeZone: string,
  now: Date,
  window?: { from: Date; to: Date }
): DaySlice[] {
  let start = new Date(entry.startedAt)
  let end = effectiveEnd(entry, now)
  if (window) {
    if (start < window.from) start = window.from
    if (end > window.to) end = window.to
  }
  if (end <= start) return []

  const slices: DaySlice[] = []
  let cursor = start
  // Bounded so a corrupt row can never spin this forever.
  for (let guard = 0; guard < 400 && cursor < end; guard++) {
    const nextMidnight = addZonedDays(startOfZonedDay(cursor, timeZone), 1, timeZone)
    const sliceEnd = nextMidnight < end ? nextMidnight : end
    const minutes = minutesBetween(cursor, sliceEnd)
    if (minutes > 0) slices.push({ dayKey: zonedDayKey(cursor, timeZone), minutes })
    cursor = sliceEnd
  }
  return slices
}

/** Every workshop day key from `from` to `to` inclusive, in order. */
export function dayKeysBetween(from: Date, to: Date, timeZone: string): string[] {
  const keys: string[] = []
  let cursor = startOfZonedDay(from, timeZone)
  const last = startOfZonedDay(to, timeZone)
  for (let guard = 0; guard < 400 && cursor <= last; guard++) {
    keys.push(zonedDayKey(cursor, timeZone))
    cursor = addZonedDays(cursor, 1, timeZone)
  }
  return keys
}

export interface TechnicianSheet {
  technician: SheetTechnician
  totalMinutes: number
  /** Minutes per workshop day, only for days with time on them. */
  byDay: Map<string, number>
  entries: SheetEntry[]
  running: SheetEntry | null
}

export interface Timesheet {
  technicians: TechnicianSheet[]
  dayKeys: string[]
  /** Minutes per day across every technician. */
  dayTotals: Map<string, number>
  totalMinutes: number
  runningCount: number
}

/**
 * Fold a window of entries into a per-technician, per-day sheet.
 *
 * Technicians with nothing in the window still appear when passed in, so a
 * manager sees who did not clock at all, which is often the point. They sort
 * by most time first; a technician with no time keeps the roster order.
 */
export function buildTimesheet(args: {
  entries: SheetEntry[]
  technicians: SheetTechnician[]
  from: Date
  to: Date
  timeZone: string
  now: Date
}): Timesheet {
  const { entries, technicians, from, to, timeZone, now } = args
  const window = { from, to }
  const sheets = new Map<string, TechnicianSheet>()

  for (const tech of technicians) {
    sheets.set(tech.id, {
      technician: tech,
      totalMinutes: 0,
      byDay: new Map(),
      entries: [],
      running: null,
    })
  }

  const dayTotals = new Map<string, number>()
  let totalMinutes = 0
  let runningCount = 0

  for (const entry of entries) {
    let sheet = sheets.get(entry.technicianId)
    if (!sheet) {
      // An entry from a technician since deactivated still counts; the sheet
      // names them from the entry itself.
      sheet = {
        technician: {
          id: entry.technicianId,
          name: entry.technicianName,
          color: entry.technicianColor,
        },
        totalMinutes: 0,
        byDay: new Map(),
        entries: [],
        running: null,
      }
      sheets.set(entry.technicianId, sheet)
    }
    sheet.entries.push(entry)
    if (!entry.endedAt) {
      runningCount++
      if (!sheet.running || entry.startedAt > sheet.running.startedAt) sheet.running = entry
    }
    for (const slice of sliceByDay(entry, timeZone, now, window)) {
      sheet.byDay.set(slice.dayKey, (sheet.byDay.get(slice.dayKey) ?? 0) + slice.minutes)
      dayTotals.set(slice.dayKey, (dayTotals.get(slice.dayKey) ?? 0) + slice.minutes)
      sheet.totalMinutes += slice.minutes
      totalMinutes += slice.minutes
    }
  }

  const rosterIndex = new Map(technicians.map((t, i) => [t.id, i]))
  const ordered = [...sheets.values()].sort((a, b) => {
    if (b.totalMinutes !== a.totalMinutes) return b.totalMinutes - a.totalMinutes
    return (
      (rosterIndex.get(a.technician.id) ?? Number.MAX_SAFE_INTEGER) -
      (rosterIndex.get(b.technician.id) ?? Number.MAX_SAFE_INTEGER)
    )
  })

  return {
    technicians: ordered,
    dayKeys: dayKeysBetween(from, new Date(to.getTime() - 1), timeZone),
    dayTotals,
    totalMinutes,
    runningCount,
  }
}

/** "7h 05m", "45m", "0m". For totals and rows alike. */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest}m`
  return `${h}h ${String(rest).padStart(2, '0')}m`
}

/** "1:05:09" while a clock runs, so the seconds visibly move. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Hours for a labor line, to the nearest quarter, never below a quarter for
 * time that was actually clocked. Nobody bills 1.37 hours.
 */
export function minutesToBillableHours(minutes: number): number {
  if (minutes <= 0) return 0
  return Math.max(0.25, Math.round(minutes / 15) / 4)
}

/** Decimal hours for CSV consumers, two places. */
export function minutesToDecimalHours(minutes: number): string {
  return (minutes / 60).toFixed(2)
}
