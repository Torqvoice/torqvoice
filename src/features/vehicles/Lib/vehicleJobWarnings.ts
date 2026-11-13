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

/**
 * The warnings for each job that has any, in the order given. A job with
 * nothing wrong is left out, so an empty list means nothing to fix.
 */
export function buildVehicleJobWarnings(
  jobs: BookedJob[],
  context: BookingContext,
  technicianNames: Map<string, string>
): VehicleJobWarning[] {
  const names = (ids: string[]) =>
    ids.map((id) => technicianNames.get(id)).filter((name): name is string => !!name)

  return jobs.flatMap((job) => {
    const check = checkSlotIn(context, {
      start: job.start,
      end: job.end,
      technicianId: job.technicianId,
      helperIds: job.helperIds,
      workBayId: job.workBayId,
      excludeId: job.id,
    })
    const away = check.conflicts
      .filter((c) => c.kind === 'absence')
      .map((c) => ({
        people: names(c.people),
        reason: c.label,
        start: c.start.toISOString(),
        end: c.end.toISOString(),
      }))
    const clashes = check.conflicts
      .filter((c) => c.kind !== 'absence')
      .map((c) => ({
        label: c.label,
        start: c.start.toISOString(),
        end: c.end.toISOString(),
        onTechnician: c.onTechnician,
        onBay: c.onBay,
        people: names(c.people),
      }))
    const closures = check.closures.map((c) => c.name)
    if (away.length === 0 && clashes.length === 0 && closures.length === 0 && !check.closedWeekday)
      return []
    return [
      {
        serviceRecordId: job.id,
        title: job.title,
        invoiceNumber: job.invoiceNumber,
        start: job.start.toISOString(),
        closures,
        closedWeekday: check.closedWeekday,
        away,
        clashes,
      },
    ]
  })
}
