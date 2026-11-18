import { addZonedDays, atZonedTime, isZonedWeekend, startOfZonedDay } from '@/lib/timezone'
import {
  type WorkshopCalendar,
  dayOf,
  isOpenFor,
  openIntervalsOn,
  spanOf,
} from '@/features/workshop-calendar/Lib/calendar'
/**
 * Whether a slot in the shop is free, and where the next free one is.
 *
 * A technician and a bay are each a resource that can hold one job at a time,
 * and the board lets both be set independently, so a booking can clash on
 * either without clashing on the other. Everything here is pure: the rules
 * are worth testing on their own, and the caller brings the bookings.
 *
 * Inspections occupy a bay and a person exactly as a job does, so they arrive
 * in the same list rather than being a second kind of thing to remember.
 */

export interface Booking {
  id: string
  /**
   * What it is, so a clash can name it. An absence is a technician's time
   * off, held like a booking so nothing is offered while they are away.
   */
  kind: 'serviceRecord' | 'inspection' | 'absence'
  /** For an absence: its reason (holiday, sick, training, other). */
  label: string
  start: Date
  end: Date
  technicianId?: string | null
  /** Everybody else on the job, whose time it holds as much as the technician's. */
  helperIds?: string[]
  workBayId?: string | null
}

export interface Slot {
  start: Date
  end: Date
  technicianId?: string | null
  /** Who else the slot is for, when the job has helpers. */
  helperIds?: string[]
  workBayId?: string | null
}

/** Everybody a booking or a slot holds: its technician and whoever helps. */
export function peopleOf(held: { technicianId?: string | null; helperIds?: string[] }): string[] {
  const helpers = held.helperIds ?? []
  return held.technicianId ? [held.technicianId, ...helpers] : helpers
}

/**
 * The people a slot and a booking both need, which is who is double-booked
 * when the two overlap. Empty when they share nobody.
 */
export function sharedPeople(slot: Slot, booking: Booking): string[] {
  const wanted = peopleOf(slot)
  if (wanted.length === 0) return []
  const held = new Set(peopleOf(booking))
  return wanted.filter((id) => held.has(id))
}

/** The shop's bookable hours, as "HH:mm" on the shop's own clock. */
export interface WorkingHours {
  start: string
  end: string
  /**
   * IANA zone the hours are read in. The server may well run in UTC while
   * the shop is in Oslo, so "08:00" means nothing until the zone is named.
   * Missing means the process's own zone, which is only right by luck.
   */
  timeZone?: string
  /**
   * Whether Saturday and Sunday can be booked. Off by default: a shop that
   * works weekends says so, and one that does not should never be handed a
   * Sunday morning as its next free slot.
   */
  includeWeekends?: boolean
  /**
   * Hours per weekday and the days the workshop is closed. When set it
   * decides when the shop is open, and the three fields above only describe
   * the usual day.
   */
  calendar?: WorkshopCalendar
}

/** Two half-open intervals overlap when each starts before the other ends. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime()
}

/**
 * The bookings a slot would collide with.
 *
 * A booking only counts when it shares a resource. Two jobs at the same hour
 * in different bays with different people are not a clash, and a job with
 * neither set is not holding anything, so it cannot be clashed with.
 *
 * A person is taken whichever way they are on the other job: a helper is as
 * busy as the technician they are helping, so a slot for either clashes with
 * a booking that holds them as the other.
 */
export function findConflicts(slot: Slot, bookings: Booking[], excludeId?: string): Booking[] {
  return bookings.filter((booking) => {
    if (booking.id === excludeId) return false
    if (!overlaps(slot.start, slot.end, booking.start, booking.end)) return false
    const samePerson = sharedPeople(slot, booking).length > 0
    const sameBay = !!slot.workBayId && booking.workBayId === slot.workBayId
    return samePerson || sameBay
  })
}

function zoneOf(hours: WorkingHours): string {
  return hours.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
}

const isWeekend = (d: Date, hours: WorkingHours) => isZonedWeekend(d, zoneOf(hours))

/** The opening moment of the working day `date` falls in. */
function dayStart(date: Date, hours: WorkingHours): Date {
  return atZonedTime(date, hours.start, zoneOf(hours))
}

function dayEnd(date: Date, hours: WorkingHours): Date {
  return atZonedTime(date, hours.end, zoneOf(hours))
}

/** Whether the whole slot sits inside one bookable day. */
export function withinWorkingHours(slot: Slot, hours: WorkingHours): boolean {
  if (hours.calendar) return isOpenFor(hours.calendar, slot.start, slot.end)
  if (!hours.includeWeekends && isWeekend(slot.start, hours)) return false
  const open = dayStart(slot.start, hours)
  const close = dayEnd(slot.start, hours)
  return slot.start >= open && slot.end <= close
}

/**
 * The earliest free slot of `durationMinutes`, at or after `from`.
 *
 * Walks the working days forward, and inside each one steps from the opening
 * time to the end of whatever is in the way, which lands exactly on the
 * moment a resource frees up rather than on an arbitrary grid. A shop booked
 * to the minute for a fortnight gets null instead of a slot in the far
 * future that nobody would want offered.
 */
export function nextAvailableSlot({
  from,
  durationMinutes,
  bookings,
  hours,
  technicianId,
  helperIds,
  workBayId,
  excludeId,
  searchDays = 30,
}: {
  from: Date
  durationMinutes: number
  bookings: Booking[]
  hours: WorkingHours
  technicianId?: string | null
  /** Who else has to be free: a slot is only free when the whole team is. */
  helperIds?: string[]
  workBayId?: string | null
  excludeId?: string
  searchDays?: number
}): Slot | null {
  const durationMs = Math.max(1, durationMinutes) * 60_000
  const zone = zoneOf(hours)
  const day = startOfZonedDay(from, zone)

  for (let i = 0; i < searchDays; i++) {
    const cursorDay = addZonedDays(day, i, zone)
    // The open stretches of the day: its hours, less any closure. Without a
    // calendar, the one usual day on weekdays.
    const stretches = hours.calendar
      ? openIntervalsOn(hours.calendar, dayOf(cursorDay, zone))
      : !hours.includeWeekends && isWeekend(cursorDay, hours)
        ? []
        : [{ start: dayStart(cursorDay, hours), end: dayEnd(cursorDay, hours) }]

    for (const stretch of stretches) {
      const close = stretch.end
      // Today starts from now rather than from opening time, so a search at
      // half past two is not offered nine in the morning.
      let cursor = new Date(stretch.start)
      if (from > cursor) cursor = new Date(from)
      // Whole minutes: a slot starting at 09:07:23 is noise on a booking sheet.
      cursor.setSeconds(0, 0)
      if (cursor.getTime() % 60_000 !== 0)
        cursor = new Date(Math.ceil(cursor.getTime() / 60_000) * 60_000)

      while (cursor.getTime() + durationMs <= close.getTime()) {
        const candidate: Slot = {
          start: new Date(cursor),
          end: new Date(cursor.getTime() + durationMs),
          technicianId,
          helperIds,
          workBayId,
        }
        const clashes = findConflicts(candidate, bookings, excludeId)
        if (clashes.length === 0) return candidate
        // Jump to the moment the last thing in the way finishes; stepping by a
        // fixed interval would try the same occupied minutes over and over.
        const freeAt = Math.max(...clashes.map((c) => c.end.getTime()))
        cursor = new Date(Math.max(freeAt, cursor.getTime() + 60_000))
      }
    }
  }

  return null
}

/**
 * Each technician's time off as a booking of their time, so a clash check or
 * a slot search treats them as taken while they are away.
 */
export function absenceBookings(calendar: WorkshopCalendar | undefined): Booking[] {
  if (!calendar) return []
  return calendar.absences.map((absence) => {
    const span = spanOf(absence, calendar.timeZone)
    return {
      id: `absence:${absence.id}`,
      kind: 'absence' as const,
      label: absence.reason,
      start: span.start,
      end: span.end,
      technicianId: absence.technicianId,
      workBayId: null,
    }
  })
}

/**
 * How many minutes each technician is booked for inside one day.
 *
 * A booking counts for the part of it that falls inside the day, so a job
 * that runs over midnight is split between the two days rather than counted
 * whole on both. The day's edges are instants, worked out by the caller in
 * the workshop's zone: this function never looks at a clock.
 *
 * A job with helpers fills the day of everybody on it. Two people on a
 * three-hour job are each booked for three hours: the board plans a person's
 * day, and neither of them can be given something else for those hours.
 */
export function technicianMinutesInDay(
  bookings: Booking[],
  dayStart: Date,
  dayEnd: Date
): Record<string, number> {
  const minutes: Record<string, number> = {}
  for (const booking of bookings) {
    // Time off is not work: the board shows it as time away, not as load.
    if (booking.kind === 'absence') continue
    const people = peopleOf(booking)
    if (people.length === 0) continue
    const from = Math.max(booking.start.getTime(), dayStart.getTime())
    const to = Math.min(booking.end.getTime(), dayEnd.getTime())
    if (to <= from) continue
    const held = Math.round((to - from) / 60000)
    for (const id of people) minutes[id] = (minutes[id] ?? 0) + held
  }
  return minutes
}
