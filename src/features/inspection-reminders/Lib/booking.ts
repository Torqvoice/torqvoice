import { loadBookingContext } from '@/features/workboard/Lib/bookings'
import { type Booking, type Slot, findConflicts } from '@/features/workboard/Lib/availability'
import { db } from '@/lib/db'
import {
  addZonedDays,
  atZonedTime,
  isZonedWeekend,
  startOfZonedDay,
  zonedDayKey,
} from '@/lib/timezone'
import type { InspectionReminderSettings } from './settings'

/**
 * What a customer may book from a reminder link: whole slots of the
 * workshop's inspection duration, on working days from the lead time out to
 * the horizon, wherever a bay (or, in a shop without bays, a technician) is
 * free. Times are the workshop's own wall clock, the same reckoning the
 * work board uses.
 */

export interface Resource {
  technicianId?: string | null
  workBayId?: string | null
}

export type DayStatus = 'open' | 'limited' | 'full' | 'closed'

export interface BookableDay {
  /** YYYY-MM-DD in the workshop's day. */
  date: string
  status: DayStatus
  /** ISO start times that are free. Empty when full or closed. */
  starts: string[]
}

const STEP_MINUTES = 30

export function dayKey(d: Date, timeZone: string): string {
  return zonedDayKey(d, timeZone)
}

/** Bays when the shop has any, else technicians: what a booking occupies. */
export async function bookingResources(organizationId: string): Promise<Resource[]> {
  const bays = await db.workBay.findMany({
    where: { organizationId, isActive: true },
    select: { id: true },
    orderBy: { name: 'asc' },
  })
  if (bays.length > 0) return bays.map((b) => ({ workBayId: b.id }))
  const techs = await db.technician.findMany({
    where: { organizationId, isActive: true },
    select: { id: true },
    orderBy: { name: 'asc' },
  })
  return techs.map((t) => ({ technicianId: t.id }))
}

/** Resources with nothing in the way of this slot. */
export function freeResources(
  start: Date,
  durationMinutes: number,
  resources: Resource[],
  bookings: Booking[]
): Resource[] {
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  return resources.filter((r) => {
    const slot: Slot = { start, end, technicianId: r.technicianId, workBayId: r.workBayId }
    return findConflicts(slot, bookings).length === 0
  })
}

/** The first day a customer may book: lead days from today, at the shop's midnight. */
export function firstBookableDay(now: Date, leadDays: number, timeZone: string): Date {
  return addZonedDays(startOfZonedDay(now, timeZone), Math.max(1, leadDays), timeZone)
}

/**
 * Every day in the booking window with its free start times. A start is
 * free when more resources are free than the walk-in reserve keeps back.
 */
export function bookableDays(input: {
  now: Date
  settings: InspectionReminderSettings
  resources: Resource[]
  bookings: Booking[]
}): BookableDay[] {
  const { settings, resources, bookings } = input
  const zone = settings.timeZone
  const days: BookableDay[] = []
  const first = firstBookableDay(input.now, settings.leadDays, zone)
  const totalDays = settings.horizonWeeks * 7
  for (let i = 0; i < totalDays; i++) {
    const day = addZonedDays(first, i, zone)
    if (!settings.workingHours.includeWeekends && isZonedWeekend(day, zone)) {
      days.push({ date: dayKey(day, zone), status: 'closed', starts: [] })
      continue
    }
    const open = atZonedTime(day, settings.workingHours.start, zone)
    const close = atZonedTime(day, settings.workingHours.end, zone)
    const starts: string[] = []
    let possible = 0
    for (
      let cursor = open;
      cursor.getTime() + settings.durationMinutes * 60_000 <= close.getTime();
      cursor = new Date(cursor.getTime() + STEP_MINUTES * 60_000)
    ) {
      possible += 1
      const free = freeResources(cursor, settings.durationMinutes, resources, bookings)
      if (free.length > settings.walkInReserve) starts.push(cursor.toISOString())
    }
    const status: DayStatus =
      starts.length === 0 ? 'full' : starts.length * 2 < possible ? 'limited' : 'open'
    days.push({ date: dayKey(day, zone), status, starts })
  }
  return days
}

/** Everything the booking page needs about availability, in one read. */
export async function availabilityFor(
  organizationId: string,
  settings: InspectionReminderSettings,
  now = new Date()
): Promise<{ resources: Resource[]; days: BookableDay[]; firstStart: string | null }> {
  const resources = await bookingResources(organizationId)
  if (resources.length === 0) return { resources, days: [], firstStart: null }
  const { bookings } = await loadBookingContext(organizationId, now)
  const days = bookableDays({ now, settings, resources, bookings })
  const firstStart = days.find((d) => d.starts.length > 0)?.starts[0] ?? null
  return { resources, days, firstStart }
}

/**
 * Whether one start is bookable right now, and which resource takes it.
 * Read again at confirm time, so two customers cannot both get 08:00.
 */
export async function claimableResource(
  organizationId: string,
  settings: InspectionReminderSettings,
  start: Date,
  now = new Date()
): Promise<Resource | null> {
  const zone = settings.timeZone
  const first = firstBookableDay(now, settings.leadDays, zone)
  if (start < first) return null
  const horizonEnd = addZonedDays(first, settings.horizonWeeks * 7, zone)
  if (start >= horizonEnd) return null
  if (!settings.workingHours.includeWeekends && isZonedWeekend(start, zone)) return null
  const open = atZonedTime(start, settings.workingHours.start, zone)
  const close = atZonedTime(start, settings.workingHours.end, zone)
  const end = new Date(start.getTime() + settings.durationMinutes * 60_000)
  if (start < open || end > close) return null
  if ((start.getTime() - open.getTime()) % (STEP_MINUTES * 60_000) !== 0) return null

  const resources = await bookingResources(organizationId)
  if (resources.length === 0) return null
  const { bookings } = await loadBookingContext(organizationId, now)
  const free = freeResources(start, settings.durationMinutes, resources, bookings)
  return free.length > settings.walkInReserve ? free[0] : null
}
