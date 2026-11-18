import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { zonedDayKey, zonedParts } from '@/lib/timezone'

/** One appointment as a list shows it, on the workshop's clock. */
export type AppointmentListItem = {
  id: string
  title: string
  startAt: Date
  /** YYYY-MM-DD on the workshop's clock. */
  date: string
  /** HH:MM on the workshop's clock. */
  time: string
  /** Whether it has not started yet. */
  upcoming: boolean
  customer: { id: string; name: string } | null
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  } | null
}

function clock(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

/**
 * Appointments matching `where`, the coming ones first, soonest first, then
 * the ones already past, latest first. Somebody looking one up is nearly
 * always asking about the next visit, but last week's must still be found.
 * `where` must already be scoped to the organization.
 */
export async function listAppointments(
  where: Prisma.AppointmentWhereInput & { organizationId: string },
  options: { timeZone: string; upcoming: number; past: number; now?: Date }
): Promise<AppointmentListItem[]> {
  const now = options.now ?? new Date()
  const select = {
    id: true,
    title: true,
    startAt: true,
    customer: { select: { id: true, name: true } },
    vehicle: {
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        licensePlate: true,
        customer: { select: { id: true, name: true } },
      },
    },
  } satisfies Prisma.AppointmentSelect

  const [upcoming, past] = await Promise.all([
    db.appointment.findMany({
      where: { AND: [where, { startAt: { gte: now } }] },
      select,
      orderBy: { startAt: 'asc' },
      take: options.upcoming,
    }),
    db.appointment.findMany({
      where: { AND: [where, { startAt: { lt: now } }] },
      select,
      orderBy: { startAt: 'desc' },
      take: options.past,
    }),
  ])

  return [...upcoming, ...past].map((a) => ({
    id: a.id,
    title: a.title,
    startAt: a.startAt,
    date: zonedDayKey(a.startAt, options.timeZone),
    time: clock(a.startAt, options.timeZone),
    upcoming: a.startAt >= now,
    customer: a.customer ?? a.vehicle?.customer ?? null,
    vehicle: a.vehicle
      ? {
          id: a.vehicle.id,
          make: a.vehicle.make,
          model: a.vehicle.model,
          year: a.vehicle.year,
          licensePlate: a.vehicle.licensePlate,
        }
      : null,
  }))
}
