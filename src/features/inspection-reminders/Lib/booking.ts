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
import {
  type Interval,
  type WorkshopCalendar,
  dayState,
  openIntervalsOn,
} from '@/features/workshop-calendar/Lib/calendar'

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
  /** Why a closed day is closed, when a holiday or closure says ("Christmas Day"). */
  closedFor?: string | null
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
 * When the shop takes bookings on `day`: its open stretches from the calendar
 * (hours per weekday, less closures), or the one usual day on weekdays when
 * there is no calendar.
 */
function bookingStretches(
  day: Date,
  settings: InspectionReminderSettings,
  calendar: WorkshopCalendar | undefined
): Interval[] {
  const zone = settings.timeZone
  if (calendar) return openIntervalsOn(calendar, dayKey(day, zone))
  if (!settings.workingHours.includeWeekends && isZonedWeekend(day, zone)) return []
  return [
    {
      start: atZonedTime(day, settings.workingHours.start, zone),
      end: atZonedTime(day, settings.workingHours.end, zone),
    },
  ]
}

/** The grid of start times in a stretch: every STEP_MINUTES from its start. */
function startsIn(stretch: Interval, durationMinutes: number): Date[] {
  const out: Date[] = []
  for (
    let cursor = stretch.start;
    cursor.getTime() + durationMinutes * 60_000 <= stretch.end.getTime();
    cursor = new Date(cursor.getTime() + STEP_MINUTES * 60_000)
  ) {
    out.push(cursor)
  }
  return out
}

/**
 * Every day in the booking window with its free start times. A start is
 * free when more resources are free than the walk-in reserve keeps back.
 * Closed days, holidays and closed hours come from the calendar when given.
 */
export function bookableDays(input: {
  now: Date
  settings: InspectionReminderSettings
  resources: Resource[]
  bookings: Booking[]
  calendar?: WorkshopCalendar
}): BookableDay[] {
  const { settings, resources, bookings, calendar } = input
  const zone = settings.timeZone
  const days: BookableDay[] = []
  const first = firstBookableDay(input.now, settings.leadDays, zone)
  const totalDays = settings.horizonWeeks * 7
  for (let i = 0; i < totalDays; i++) {
    const day = addZonedDays(first, i, zone)
    const stretches = bookingStretches(day, settings, calendar)
    if (stretches.length === 0) {
      const closedFor = calendar
        ? (dayState(calendar, dayKey(day, zone)).closures[0]?.name ?? null)
        : null
      days.push({ date: dayKey(day, zone), status: 'closed', starts: [], closedFor })
      continue
    }
    const starts: string[] = []
    let possible = 0
    for (const stretch of stretches) {
      for (const cursor of startsIn(stretch, settings.durationMinutes)) {
        possible += 1
        const free = freeResources(cursor, settings.durationMinutes, resources, bookings)
        if (free.length > settings.walkInReserve) starts.push(cursor.toISOString())
      }
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
  const { bookings, hours } = await loadBookingContext(organizationId, now)
  const days = bookableDays({ now, settings, resources, bookings, calendar: hours.calendar })
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

  const resources = await bookingResources(organizationId)
  if (resources.length === 0) return null
  const { bookings, hours } = await loadBookingContext(organizationId, now)
  // The same stretches and grid the page offered, read again: a closure added
  // since the page opened takes the time away.
  const offered = bookingStretches(start, settings, hours.calendar).some((stretch) =>
    startsIn(stretch, settings.durationMinutes).some((s) => s.getTime() === start.getTime())
  )
  if (!offered) return null
  const free = freeResources(start, settings.durationMinutes, resources, bookings)
  return free.length > settings.walkInReserve ? free[0] : null
}
