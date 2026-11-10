/**
 * The work board's clock is the workshop's, not the browser's.
 *
 * The store holds real instants, as the server sends them. The board's layout
 * and drag code was written against a `Date`'s local getters, so rather than
 * teach every layout function about time zones, a job is converted once on
 * the way in: its times become the workshop's wall clock written without a
 * zone, which the local getters then read back as workshop time. Anything the
 * board builds from those local fields (a drag, a drop) is converted once on
 * the way out, with `fromBoardDate`, before it is stored or sent.
 *
 * An empty zone means the workshop has never chosen one, and then the
 * browser's own clock is all there is: every helper here is the identity.
 *
 * The one known limit: a workshop wall-clock time that does not exist in the
 * viewer's own zone, because the viewer's clocks skip that hour on their
 * daylight saving night, cannot be held by a local `Date`. A job at such a
 * time draws an hour off for a viewer in another zone. A viewer in the
 * workshop's own zone is never affected.
 */

import type { WorkBoardJob } from '../Actions/boardActions'
import { fromZonedWallClock, toZonedWallClock, zonedParts } from '@/lib/timezone'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** A local `Date` as `YYYY-MM-DDTHH:mm:ss`, which `new Date` parses as local. */
function localIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** A stand-in local `Date` whose fields read the workshop's wall clock at `instant`. */
export function toBoardDate(instant: Date, timeZone: string): Date {
  return timeZone ? toZonedWallClock(instant, timeZone) : instant
}

/** The real instant for the workshop wall clock a board `Date`'s local fields say. */
export function fromBoardDate(date: Date, timeZone: string): Date {
  return timeZone ? fromZonedWallClock(date, timeZone) : date
}

function toBoardString(value: string | null, timeZone: string): string | null {
  if (!value) return value
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return value
  return localIso(toZonedWallClock(instant, timeZone))
}

/**
 * The job as the board draws it: start and end on the workshop's wall clock.
 * `promisedAt` stays a real instant, because the overdue check compares it
 * with now. Never put the result back in the store or send it anywhere.
 */
export function toBoardJob(job: WorkBoardJob, timeZone: string): WorkBoardJob {
  if (!timeZone) return job
  return {
    ...job,
    startDateTime: toBoardString(job.startDateTime, timeZone),
    endDateTime: toBoardString(job.endDateTime, timeZone),
  }
}

/** Today and the time of day on the workshop's clock, for "today" and the now line. */
export function boardNow(
  timeZone: string,
  now: Date = new Date()
): { dayKey: string; minutes: number } {
  if (!timeZone) {
    return {
      dayKey: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      minutes: now.getHours() * 60 + now.getMinutes(),
    }
  }
  const p = zonedParts(now, timeZone)
  return {
    dayKey: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    minutes: p.hour * 60 + p.minute,
  }
}
