import type { BookingContext } from '@/features/workboard/Lib/bookings'
import { checkSlotIn } from '@/features/workboard/Lib/slotCheck'

/**
 * One open job's booking problems, as the vehicle page shows them. Dates are
 * ISO strings: this crosses from the server page to the browser.
 */
export interface VehicleJobWarning {
  serviceRecordId: string
  /** Enough of the job to name it where the feed does not show it. */
  title: string
  invoiceNumber: string | null
  start: string
  /** Names of the workshop's own closures the job falls in. */
  closures: string[]
  /** The job is on a weekday the workshop is normally closed. */
  closedWeekday: boolean
  /** Somebody on the job is off then. `reason` is the absence's stored reason. */
  away: { people: string[]; reason: string; start: string; end: string }[]
  /** Other work holding the same person or bay. */
  clashes: {
    label: string
    start: string
    end: string
    onTechnician: boolean
    onBay: boolean
    /** Who on the job is double-booked, by name. */
    people: string[]
  }[]
}

export interface BookedJob {
  id: string
  title: string
  invoiceNumber: string | null
  start: Date
  end: Date
  technicianId: string | null
  helperIds: string[]
  workBayId: string | null
}

const DAY_MS = 86_400_000

export interface Span {
  start: Date
  end: Date
}

/**
 * The bookings a slot is checked against are read for a window of days, and
 * that window has a limit (MAX_WINDOW_DAYS in workboard/Lib/bookings). A job
 * longer than `maxDays` is checked in pieces that each fit, so nothing past
 * the limit goes unseen; any overlap with a piece is an overlap with the job.
 */
export function splitSpan(span: Span, maxDays: number): Span[] {
  const step = maxDays * DAY_MS
  const pieces: Span[] = []
  for (let at = span.start.getTime(); at < span.end.getTime(); at += step) {
    pieces.push({ start: new Date(at), end: new Date(Math.min(at + step, span.end.getTime())) })
  }
  return pieces
}

/**
 * As few windows as cover every span, each no longer than `maxDays` from its
 * first day: one read of the workshop's bookings per window rather than per
 * job. Spans must each fit in `maxDays` already (see splitSpan).
 */
export function planWindows(spans: Span[], maxDays: number): Span[] {
  const sorted = [...spans].sort((a, b) => a.start.getTime() - b.start.getTime())
  const windows: Span[] = []
  for (const span of sorted) {
    const current = windows[windows.length - 1]
    if (current && span.end.getTime() <= current.start.getTime() + maxDays * DAY_MS) {
      if (span.end > current.end) current.end = span.end
    } else {
      windows.push({ start: span.start, end: span.end })
    }
  }
  return windows
}

/**
 * The warnings for each job that has any, in the order given. A job with
 * nothing wrong is left out, so an empty list means nothing to fix.
 *
 * `contextFor` hands the bookings read for the window holding a stretch of
 * time; a single context does for jobs that all fit one window. `maxDays`
 * is how long a stretch may be before it is checked in pieces.
 */
export function buildVehicleJobWarnings(
  jobs: BookedJob[],
  contextFor: BookingContext | ((span: Span) => BookingContext),
  technicianNames: Map<string, string>,
  maxDays = Number.POSITIVE_INFINITY
): VehicleJobWarning[] {
  const names = (ids: string[]) =>
    ids.map((id) => technicianNames.get(id)).filter((name): name is string => !!name)
  const context = (span: Span) => (typeof contextFor === 'function' ? contextFor(span) : contextFor)

  return jobs.flatMap((job) => {
    const pieces = Number.isFinite(maxDays) ? splitSpan(job, maxDays) : [job]
    const checks = pieces.map((piece) =>
      checkSlotIn(context(piece), {
        start: piece.start,
        end: piece.end,
        technicianId: job.technicianId,
        helperIds: job.helperIds,
        workBayId: job.workBayId,
        excludeId: job.id,
      })
    )
    // One clash or closure met by two pieces is still one.
    const conflicts = [
      ...new Map(checks.flatMap((c) => c.conflicts).map((c) => [c.id, c])).values(),
    ]
    const closures = [...new Set(checks.flatMap((c) => c.closures.map((closure) => closure.name)))]
    // Whether the day the job starts is a closed weekday, as the work order asks.
    const closedWeekday = checks[0]?.closedWeekday ?? false

    const away = conflicts
      .filter((c) => c.kind === 'absence')
      .map((c) => ({
        people: names(c.people),
        reason: c.label,
        start: c.start.toISOString(),
        end: c.end.toISOString(),
      }))
    const clashes = conflicts
      .filter((c) => c.kind !== 'absence')
      .map((c) => ({
        label: c.label,
        start: c.start.toISOString(),
        end: c.end.toISOString(),
        onTechnician: c.onTechnician,
        onBay: c.onBay,
        people: names(c.people),
      }))
    if (away.length === 0 && clashes.length === 0 && closures.length === 0 && !closedWeekday)
      return []
    return [
      {
        serviceRecordId: job.id,
        title: job.title,
        invoiceNumber: job.invoiceNumber,
        start: job.start.toISOString(),
        closures,
        closedWeekday,
        away,
        clashes,
      },
    ]
  })
}
