import { addZonedDays, atZonedTime, isZonedWeekend, startOfZonedDay } from '@/lib/timezone'
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
  /** What it is, so a clash can name it. */
  kind: 'serviceRecord' | 'inspection'
  label: string
  start: Date
  end: Date
  technicianId?: string | null
  workBayId?: string | null
}

export interface Slot {
  start: Date
  end: Date
  technicianId?: string | null
  workBayId?: string | null
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
 */
export function findConflicts(slot: Slot, bookings: Booking[], excludeId?: string): Booking[] {
  return bookings.filter((booking) => {
    if (booking.id === excludeId) return false
    if (!overlaps(slot.start, slot.end, booking.start, booking.end)) return false
    const sameTech = !!slot.technicianId && booking.technicianId === slot.technicianId
    const sameBay = !!slot.workBayId && booking.workBayId === slot.workBayId
    return sameTech || sameBay
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
  workBayId,
  excludeId,
  searchDays = 30,
}: {
  from: Date
  durationMinutes: number
  bookings: Booking[]
  hours: WorkingHours
  technicianId?: string | null
  workBayId?: string | null
  excludeId?: string
  searchDays?: number
}): Slot | null {
  const durationMs = Math.max(1, durationMinutes) * 60_000
  const zone = zoneOf(hours)
  const day = startOfZonedDay(from, zone)

  for (let i = 0; i < searchDays; i++) {
    const cursorDay = addZonedDays(day, i, zone)
    if (!hours.includeWeekends && isWeekend(cursorDay, hours)) continue

    const close = dayEnd(cursorDay, hours)
    // Today starts from now rather than from opening time, so a search at
    // half past two is not offered nine in the morning.
    let cursor = dayStart(cursorDay, hours)
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

  return null
}
