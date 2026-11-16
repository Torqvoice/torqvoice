/**
 * Pure geometry for the week timeline.
 *
 * Everything here answers one of two questions: where does a job sit on a given
 * day's time axis, and how do jobs that overlap share the width of a lane. It
 * is deliberately free of React and of Date formatting so it can be tested
 * directly and reused by any view that draws jobs against a clock.
 */

import type { MinuteSpan } from '@/features/workshop-calendar/Lib/boardDays'
import type { WorkBoardJob } from '../Actions/boardActions'
import { getJobDateRange } from './datetime'

export const MINUTES_IN_DAY = 1440

export type TimeWindow = {
  /** Minutes from midnight of the first visible row. */
  startMins: number
  /** Minutes from midnight of the last visible row. Always > startMins. */
  endMins: number
}

/** A job placed on one day's axis, ready to be given a height and an offset. */
export type PositionedJob = {
  job: WorkBoardJob
  /** Clamped to the visible window. */
  startMins: number
  endMins: number
  /** Zero-based column inside its overlap cluster. */
  column: number
  /** How many columns that cluster needs. */
  columns: number
  /** The job really starts before the visible window (earlier day, or earlier hour). */
  continuesBefore: boolean
  /** The job really ends after it. */
  continuesAfter: boolean
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** Local midnight of a YYYY-MM-DD day string. */
export function dayStartDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`)
}

/**
 * Where a job sits on one calendar day, before overlap resolution.
 *
 * Returns null when the job does not touch that day or has no times at all.
 * A job running Tuesday 16:00 to Wednesday 09:00 resolves on both days, with
 * `continuesAfter` on Tuesday and `continuesBefore` on Wednesday, so neither
 * end of it can be mistaken for a real start or finish.
 */
export function resolveJobOnDay(
  job: WorkBoardJob,
  dateStr: string,
  window: TimeWindow
): Omit<PositionedJob, 'column' | 'columns'> | null {
  const { start, end } = getJobDateRange(job)
  if (!start || !end) return null

  const dayStart = dayStartDate(dateStr)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  if (!(start < dayEnd && end > dayStart)) return null

  const rawStart = start <= dayStart ? 0 : minutesOfDay(start)
  const rawEnd = end >= dayEnd ? MINUTES_IN_DAY : minutesOfDay(end)

  const startMins = Math.max(rawStart, window.startMins)
  const endMins = Math.min(Math.max(rawEnd, startMins), window.endMins)

  // A job entirely outside the visible hours would collapse to a zero-height
  // sliver at one edge; the caller shows those in the out-of-hours strip.
  if (rawEnd <= window.startMins || rawStart >= window.endMins) return null

  return {
    job,
    startMins,
    endMins,
    continuesBefore: rawStart < window.startMins || start < dayStart,
    continuesAfter: rawEnd > window.endMins || end > dayEnd,
  }
}

/**
 * Lay out one lane's jobs for one day: side by side where they overlap, full
 * width where they do not.
 *
 * Jobs are grouped into clusters of transitively overlapping work; every job in
 * a cluster reports the same column count, so a cluster of three renders as
 * three even columns and a lone job either side of it still renders full width.
 */
export function layoutLaneDay(
  jobs: WorkBoardJob[],
  dateStr: string,
  window: TimeWindow
): PositionedJob[] {
  const resolved = jobs
    .map((job) => resolveJobOnDay(job, dateStr, window))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort(
      (a, b) =>
        a.startMins - b.startMins || b.endMins - a.endMins || a.job.id.localeCompare(b.job.id)
    )

  const positioned: PositionedJob[] = []
  /** End time of the job currently occupying each column. */
  let columnEnds: number[] = []
  let clusterStart = 0
  let clusterEnd = -1

  const closeCluster = () => {
    const columns = columnEnds.length
    for (let i = clusterStart; i < positioned.length; i++) {
      positioned[i].columns = columns
    }
    columnEnds = []
    clusterStart = positioned.length
  }

  for (const item of resolved) {
    if (item.startMins >= clusterEnd && columnEnds.length > 0) {
      closeCluster()
      clusterEnd = -1
    }

    let column = columnEnds.findIndex((end) => end <= item.startMins)
    if (column === -1) {
      column = columnEnds.length
      columnEnds.push(item.endMins)
    } else {
      columnEnds[column] = item.endMins
    }

    clusterEnd = Math.max(clusterEnd, item.endMins)
    positioned.push({ ...item, column, columns: 1 })
  }
  if (columnEnds.length > 0) closeCluster()

  return positioned
}

/** Jobs with a lane but no times: real work that nobody has put on the clock yet. */
export function isUnscheduled(job: WorkBoardJob): boolean {
  return !job.startDateTime || !job.endDateTime
}

/**
 * The hours the board shows.
 *
 * The configured work day is the floor. Anything booked outside it stretches
 * the axis to the nearest hour rather than being hidden, because a job that
 * runs to 19:00 in a shop that closes at 17:00 is exactly the job someone needs
 * to see.
 */
export function computeTimeWindow(
  jobs: WorkBoardJob[],
  days: string[],
  workDayStart: number,
  workDayEnd: number
): TimeWindow {
  let startMins = workDayStart
  let endMins = Math.max(workDayEnd, workDayStart + 60)

  if (days.length > 0) {
    const first = dayStartDate(days[0])
    const last = dayStartDate(days[days.length - 1])
    last.setDate(last.getDate() + 1)

    /** Pull the axis open until it contains this time of day. */
    const include = (mins: number) => {
      startMins = Math.min(startMins, Math.floor(mins / 60) * 60)
      endMins = Math.max(endMins, Math.ceil(mins / 60) * 60)
    }

    for (const job of jobs) {
      const { start, end } = getJobDateRange(job)
      if (!start || !end) continue
      if (!(start < last && end > first)) continue

      // Only the endpoints that actually fall in the shown days can widen the
      // axis. A job running across several days covers its middle days
      // completely; letting that widen the axis to midnight would flatten the
      // whole week for one long job, so those days render clamped with a
      // continuation marker instead.
      if (start >= first && start < last) include(minutesOfDay(start))
      if (end > first && end <= last) {
        const endOfDay = minutesOfDay(end)
        // Midnight reads as the end of the previous day, not the start of a new one.
        include(endOfDay === 0 ? MINUTES_IN_DAY : endOfDay)
      }
    }
  }

  return {
    startMins: Math.max(0, Math.min(startMins, MINUTES_IN_DAY - 60)),
    endMins: Math.min(MINUTES_IN_DAY, Math.max(endMins, startMins + 60)),
  }
}

/** Hour marks for the time gutter, inclusive of the closing hour. */
export function hourMarks(window: TimeWindow): number[] {
  const marks: number[] = []
  const first = Math.floor(window.startMins / 60) * 60
  for (let m = first; m <= window.endMins; m += 60) {
    if (m >= window.startMins) marks.push(m)
  }
  return marks
}

/** Snap a minute value to the nearest step, keeping it inside the window. */
export function snapToStep(mins: number, step: number, window: TimeWindow): number {
  const snapped = Math.round(mins / step) * step
  return Math.max(window.startMins, Math.min(window.endMins, snapped))
}

/** What is known about one lane's working day, for counting the work on it. */
export type DayHours = {
  /**
   * The parts of the day the workshop is closed, in minutes from midnight, its
   * usual closed hours included. Leave out when the opening hours are not
   * known (the workshop calendar has not loaded).
   */
  closedSpans?: MinuteSpan[]
  /** The parts of the day the lane's technician is away. */
  awaySpans?: MinuteSpan[]
  /** The lane's daily capacity in minutes; 0 or missing when it has none. */
  capacityMinutes?: number
}

/** The minutes of `from`-`to` left once every span is taken out of it. */
function minutesOutside(from: number, to: number, spans: MinuteSpan[]): number {
  let pieces: MinuteSpan[] = to > from ? [{ startMins: from, endMins: to }] : []
  for (const cut of spans) {
    const next: MinuteSpan[] = []
    for (const piece of pieces) {
      if (cut.endMins <= piece.startMins || cut.startMins >= piece.endMins) {
        next.push(piece)
        continue
      }
      if (cut.startMins > piece.startMins)
        next.push({ startMins: piece.startMins, endMins: cut.startMins })
      if (cut.endMins < piece.endMins) next.push({ startMins: cut.endMins, endMins: piece.endMins })
    }
    pieces = next
  }
  return pieces.reduce((sum, piece) => sum + piece.endMins - piece.startMins, 0)
}

/**
 * Minutes of work a lane carries on one day: the one figure every view of a
 * day shows (the card grid, the timeline's lane header and its tooltip), so
 * two views of the same day cannot disagree.
 *
 * A job that starts and ends on the day counts every minute of it, the part
 * outside opening hours included: a job that runs past closing time is still
 * work someone has to do, and the utilisation figure is the one number that
 * tells a planner whether the day is full.
 *
 * A job that runs over more than one day cannot be counted that way. Clipped
 * to the calendar day it is 24 hours on every day it passes through, and
 * counted whole it is its entire length on each of them (a seven week
 * restoration once read "1117h / 8h" on a wall screen). Nobody works on it
 * through the night, so on each day it touches it counts only the part of it
 * inside the working day:
 *
 * - the workshop's opening hours that day, less any closure, when `hours`
 *   brings them. A closed day adds nothing.
 * - less the time the lane's technician is away.
 * - and never more than the lane's daily capacity, which is also the limit
 *   when the opening hours are not known: one job cannot take more of a
 *   person's day than their day.
 *
 * So a job passing through an ordinary day fills that day once, and three of
 * them read as three days' work booked into one.
 *
 * Who a job counts for is not decided here: the caller passes the lane's
 * jobs, and a job shared with helpers is in each of their lanes.
 */
export function bookedMinutesOnDay(
  jobs: WorkBoardJob[],
  dateStr: string,
  hours: DayHours = {}
): number {
  const dayStart = dayStartDate(dateStr)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const capacity = hours.capacityMinutes ?? 0
  const notWorked = [...(hours.closedSpans ?? []), ...(hours.awaySpans ?? [])]

  let total = 0
  for (const job of jobs) {
    const { start, end } = getJobDateRange(job)
    if (!start || !end) continue
    if (!(start < dayEnd && end > dayStart)) continue

    if (start >= dayStart && end <= dayEnd) {
      total += Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
      continue
    }

    // Clock minutes, not time elapsed: the spans it is measured against are
    // minutes on the day's clock.
    const from = start <= dayStart ? 0 : minutesOfDay(start)
    const to = end >= dayEnd ? MINUTES_IN_DAY : minutesOfDay(end)
    const worked = minutesOutside(from, to, notWorked)
    total += capacity > 0 ? Math.min(worked, capacity) : worked
  }
  return total
}

/** A day's booked minutes read against its capacity. */
export type DayLoad = {
  bookedMinutes: number
  capacityMinutes: number
  /** Booked as a share of capacity; 0 for a lane with no capacity. */
  pct: number
  /** How far past capacity the day is; 0 when it is not, or has no capacity. */
  overMinutes: number
}

/**
 * How full a day (or a week of days) is: the share that sizes and colours the
 * bar and the minutes over capacity, worked out once so the card grid, the
 * timeline and the lane tooltip cannot say different things about one day.
 */
export function dayLoad(bookedMinutes: number, capacityMinutes: number): DayLoad {
  const hasCapacity = capacityMinutes > 0
  return {
    bookedMinutes,
    capacityMinutes,
    pct: hasCapacity ? (bookedMinutes / capacityMinutes) * 100 : 0,
    overMinutes: hasCapacity ? Math.max(0, bookedMinutes - capacityMinutes) : 0,
  }
}
