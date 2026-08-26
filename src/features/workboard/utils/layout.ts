/**
 * Pure geometry for the week timeline.
 *
 * Everything here answers one of two questions: where does a job sit on a given
 * day's time axis, and how do jobs that overlap share the width of a lane. It
 * is deliberately free of React and of Date formatting so it can be tested
 * directly and reused by any view that draws jobs against a clock.
 */

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

/**
 * Minutes of work a lane carries on one day.
 *
 * Clamped to the calendar day rather than to the visible hours: a job that runs
 * past closing time is still work someone has to do, and the utilisation figure
 * is the one number that tells a planner whether the day is full.
 */
export function bookedMinutesOnDay(jobs: WorkBoardJob[], dateStr: string): number {
  const dayStart = dayStartDate(dateStr)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  let total = 0
  for (const job of jobs) {
    const { start, end } = getJobDateRange(job)
    if (!start || !end) continue
    if (!(start < dayEnd && end > dayStart)) continue
    const from = start < dayStart ? dayStart : start
    const to = end > dayEnd ? dayEnd : end
    total += Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000))
  }
  return total
}
