import {
  type Absence,
  type Interval,
  type WorkshopCalendar,
  absencesOn,
  awayAllDay,
  dayState,
  startOfDay,
  addDays,
  subtract,
  windowOn,
} from './calendar'
import { zonedParts } from '@/lib/timezone'

/**
 * The calendar as the work board draws it: stretches of each day in minutes
 * from the workshop's midnight, which is how the board lays out its columns.
 */

export interface MinuteSpan {
  startMins: number
  endMins: number
}

/**
 * Where `instant` falls on the workshop's clock on `key`, in minutes from
 * midnight, kept inside the day (0 to 1440). Clock time, not time elapsed:
 * the board lays a day out by its clock, so on the night the clocks change
 * a 13:00 absence must still sit at 13:00, not an hour off.
 */
function minutesInto(key: string, instant: Date, timeZone: string): number {
  if (instant.getTime() <= startOfDay(key, timeZone).getTime()) return 0
  if (instant.getTime() >= startOfDay(addDays(key, 1), timeZone).getTime()) return 24 * 60
  const { hour, minute } = zonedParts(instant, timeZone)
  return hour * 60 + minute
}

function toSpans(key: string, intervals: Interval[], timeZone: string): MinuteSpan[] {
  return intervals
    .map((i) => ({
      startMins: minutesInto(key, i.start, timeZone),
      endMins: minutesInto(key, i.end, timeZone),
    }))
    .filter((s) => s.endMins > s.startMins)
}

export interface ClosedDay {
  /** The parts of the day the workshop is closed, its usual closed hours included. */
  spans: MinuteSpan[]
  /** Only the parts a closure or holiday takes, for warning about them by name. */
  closureSpans: MinuteSpan[]
  /** Closed at no point in its usual hours. */
  allDay: boolean
  /** The closures' names; empty when it is only a closed weekday or outside hours. */
  names: string[]
  closedWeekday: boolean
}

/** When the workshop is closed on `key`: outside its hours, and any closure. */
export function closedDay(cal: WorkshopCalendar, key: string): ClosedDay {
  const state = dayState(cal, key)
  const whole: Interval = {
    start: startOfDay(key, cal.timeZone),
    end: startOfDay(addDays(key, 1), cal.timeZone),
  }
  const closureWindows = state.closures
    .map((c) => windowOn(key, c, cal.timeZone))
    .filter((w): w is Interval => w !== null)
  return {
    spans: toSpans(key, subtract([whole], state.intervals), cal.timeZone),
    closureSpans: toSpans(key, closureWindows, cal.timeZone),
    allDay: !state.open,
    names: state.closures.map((c) => c.name),
    closedWeekday: state.closedWeekday,
  }
}

export interface AwayDay {
  spans: MinuteSpan[]
  allDay: boolean
  absences: Absence[]
}

/** When a technician is away on `key`, or null when they are not. */
export function awayDay(cal: WorkshopCalendar, technicianId: string, key: string): AwayDay | null {
  const absences = absencesOn(cal, key, technicianId)
  if (absences.length === 0) return null
  const windows = absences
    .map((a) => windowOn(key, a, cal.timeZone))
    .filter((w): w is Interval => w !== null)
  return {
    spans: toSpans(key, windows, cal.timeZone),
    allDay: absences.some((a) => awayAllDay(cal, a, key)),
    absences,
  }
}

/** Whether a stretch of minutes on a day overlaps any of the spans. */
export function overlapsSpans(spans: MinuteSpan[], startMins: number, endMins: number): boolean {
  return spans.some((s) => s.startMins < endMins && s.endMins > startMins)
}
