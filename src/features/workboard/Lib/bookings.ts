import { db } from '@/lib/db'
import type { Booking, WorkingHours } from './availability'

/**
 * Everything currently holding a person or a bay, and the hours the shop works.
 *
 * A plain module rather than part of the server action beside it: a
 * 'use server' file exposes each export as an endpoint, and this one takes an
 * organization id, which must never be something a caller can choose.
 */

/** How far ahead to read. Long enough to answer "next free slot" honestly. */
const WINDOW_DAYS = 45

export async function loadBookingContext(
  organizationId: string,
  from: Date
): Promise<{ bookings: Booking[]; hours: WorkingHours }> {
  const windowStart = new Date(from)
  windowStart.setDate(windowStart.getDate() - 1)
  const windowEnd = new Date(from)
  windowEnd.setDate(windowEnd.getDate() + WINDOW_DAYS)

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
        key: { in: ['workboard.workDayStart', 'workboard.workDayEnd', 'workboard.showWeekends'] },
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
  return {
    bookings,
    hours: {
      start: map['workboard.workDayStart'] || '07:00',
      end: map['workboard.workDayEnd'] || '15:00',
      includeWeekends: map['workboard.showWeekends'] === 'true',
    },
  }
}
