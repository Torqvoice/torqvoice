import { db } from '@/lib/db'
import { resolveWorkshopTimeZone } from '@/lib/workshop-timezone'
import { dayOf } from '@/features/workshop-calendar/Lib/calendar'
import {
  loadWorkshopCalendar,
  rangeAround,
} from '@/features/workshop-calendar/Lib/loadCalendar.server'
import { type Booking, type WorkingHours, absenceBookings } from './availability'
import { ACTIVE_HELPERS } from './jobTeam'

/**
 * Everything currently holding a person or a bay, and the hours the shop works.
 *
 * A plain module rather than part of the server action beside it: a
 * 'use server' file exposes each export as an endpoint, and this one takes an
 * organization id, which must never be something a caller can choose.
 */

/** How far ahead to read by default. Long enough to answer "next free slot" honestly. */
const WINDOW_DAYS = 45
/** The most a caller can ask for: a year and a bit. */
const MAX_WINDOW_DAYS = 400

/**
 * `days` is how far past `from` to read. Online booking asks for its whole
 * horizon: jobs, closed days and leave past the default window would
 * otherwise be invisible, and a closed day there offered to a customer.
 */
export interface BookingContext {
  bookings: Booking[]
  hours: WorkingHours
  closuresEnabled: boolean
}

export async function loadBookingContext(
  organizationId: string,
  from: Date,
  opts: { days?: number } = {}
): Promise<BookingContext> {
  const days = Math.min(Math.max(Math.ceil(opts.days ?? WINDOW_DAYS), 1), MAX_WINDOW_DAYS)
  const windowStart = new Date(from)
  windowStart.setDate(windowStart.getDate() - 1)
  const windowEnd = new Date(from)
  windowEnd.setDate(windowEnd.getDate() + days)

  // Only work that actually holds a resource can be clashed with; anything
  // unassigned is on the list rather than in the shop.
  const booked = {
    startDateTime: { not: null },
    endDateTime: { not: null },
    OR: [{ technicianId: { not: null } }, { workBayId: { not: null } }],
    AND: [{ startDateTime: { lt: windowEnd } }, { endDateTime: { gt: windowStart } }],
  }

  const [records, inspections, settings] = await Promise.all([
    db.serviceRecord.findMany({
      where: { organizationId, ...booked },
      select: {
        id: true,
        title: true,
        startDateTime: true,
        endDateTime: true,
        technicianId: true,
        // A helper's time is taken by the job as much as the technician's.
        helpers: ACTIVE_HELPERS,
        workBayId: true,
        vehicle: { select: { make: true, model: true, licensePlate: true } },
      },
    }),
    db.inspection.findMany({
      where: { organizationId, ...booked },
      select: {
        id: true,
        startDateTime: true,
        endDateTime: true,
        technicianId: true,
        workBayId: true,
        vehicle: { select: { make: true, model: true, licensePlate: true } },
      },
    }),
    db.appSetting.findMany({
      where: {
        organizationId,
        key: {
          in: [
            'workboard.workDayStart',
            'workboard.workDayEnd',
            'workboard.showWeekends',
            'workshop.timezone',
            'workshop.timezoneDetected',
          ],
        },
      },
      select: { key: true, value: true },
    }),
  ])

  const describe = (v?: { make: string; model: string; licensePlate: string | null } | null) =>
    v ? [v.make, v.model, v.licensePlate].filter(Boolean).join(' ') : ''

  const bookings: Booking[] = [
    ...records.map((r) => ({
      id: r.id,
      kind: 'serviceRecord' as const,
      label: describe(r.vehicle) || r.title || '',
      start: r.startDateTime as Date,
      end: r.endDateTime as Date,
      technicianId: r.technicianId,
      helperIds: r.helpers.map((h) => h.technicianId),
      workBayId: r.workBayId,
    })),
    ...inspections.map((i) => ({
      id: i.id,
      kind: 'inspection' as const,
      label: describe(i.vehicle),
      start: i.startDateTime as Date,
      end: i.endDateTime as Date,
      technicianId: i.technicianId,
      workBayId: i.workBayId,
    })),
  ]

  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  const timeZone = resolveWorkshopTimeZone(
    map['workshop.timezone'],
    map['workshop.timezoneDetected']
  )
  // Opening hours per weekday, closed days and time off for the same window.
  // Time off joins the bookings, so a technician away is never free.
  const { enabled, calendar } = await loadWorkshopCalendar(
    organizationId,
    rangeAround(dayOf(from, timeZone), days)
  )
  return {
    bookings: [...bookings, ...absenceBookings(calendar)],
    hours: {
      start: map['workboard.workDayStart'] || '07:00',
      end: map['workboard.workDayEnd'] || '15:00',
      includeWeekends: map['workboard.showWeekends'] === 'true',
      timeZone,
      calendar,
    },
    closuresEnabled: enabled,
  }
}
