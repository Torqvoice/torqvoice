'use server'

import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import {
  findConflicts,
  nextAvailableSlot,
  sharedPeople,
  technicianMinutesInDay,
} from '../../Lib/availability'
import { addZonedDays, startOfZonedDay } from '@/lib/timezone'
import { loadBookingContext } from '../../Lib/bookings'
import {
  absencesOn,
  awayAllDay,
  closuresDuring,
  dayOf,
  dayState,
} from '@/features/workshop-calendar/Lib/calendar'

/**
 * Is this slot free, and if not, where is the next one.
 *
 * The board lets a technician and a bay be set independently, so a booking
 * can clash on either. Both questions read the same window of work, and both
 * count inspections, which hold a bay and a person exactly as a job does.
 */

/**
 * What a proposed booking would collide with. Empty means the slot is free.
 *
 * Besides other work this names a technician's time off (as a conflict of
 * kind `absence`) and any closure the slot falls in, so the desk is warned.
 * Nothing here refuses the booking: the desk may agree overtime.
 */
export async function checkSlotAvailability(input: {
  start: string
  end: string
  technicianId?: string | null
  /** Who else is on the job: their day has to be free as well. */
  helperIds?: string[]
  workBayId?: string | null
  /** The job being edited, so it never clashes with itself. */
  excludeId?: string
}) {
  return withAuth(
    async ({ organizationId }) => {
      const start = new Date(input.start)
      const end = new Date(input.end)
      if (!(start < end)) return { conflicts: [], closures: [], closedWeekday: false }

      const { bookings, hours, closuresEnabled } = await loadBookingContext(organizationId, start)
      const calendar = hours.calendar
      // The workshop's own closures matter whoever the job is for.
      const closures =
        closuresEnabled && calendar
          ? closuresDuring(calendar, start, end).map((c) => ({ name: c.name, source: c.source }))
          : []
      const closedWeekday =
        closuresEnabled && calendar
          ? dayState(calendar, dayOf(start, calendar.timeZone)).closedWeekday
          : false
      // Nothing is held, so nothing can be clashed with.
      if (!input.technicianId && !input.workBayId) return { conflicts: [], closures, closedWeekday }

      const slot = {
        start,
        end,
        technicianId: input.technicianId,
        // Helpers only count beside a technician: without one the job has none.
        helperIds: input.technicianId ? (input.helperIds ?? []) : [],
        workBayId: input.workBayId,
      }
      const conflicts = findConflicts(slot, bookings, input.excludeId)
      return {
        conflicts: conflicts.map((c) => {
          const people = sharedPeople(slot, c)
          return {
            id: c.id,
            kind: c.kind,
            label: c.label,
            start: c.start.toISOString(),
            end: c.end.toISOString(),
            // Which resource actually clashed, so the warning can say so rather
            // than leaving somebody to work it out from two times.
            onTechnician: people.length > 0,
            onBay: !!input.workBayId && c.workBayId === input.workBayId,
            // Who is double-booked, as technician ids: with two people on a
            // job "the technician is busy" no longer says which of them.
            people,
          }
        }),
        closures,
        closedWeekday,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_ORDERS },
      ],
    }
  )
}

/** The earliest slot that fits, within the shop's own working hours. */
export async function findNextSlot(input: {
  durationMinutes: number
  technicianId?: string | null
  /** Who else is on the job: the slot has to be free for all of them. */
  helperIds?: string[]
  workBayId?: string | null
  excludeId?: string
  /** Where to search from. Defaults to now. */
  from?: string
}) {
  return withAuth(
    async ({ organizationId }) => {
      const from = input.from ? new Date(input.from) : new Date()
      const { bookings, hours } = await loadBookingContext(organizationId, from)
      const slot = nextAvailableSlot({
        from,
        durationMinutes: input.durationMinutes,
        bookings,
        hours,
        technicianId: input.technicianId,
        helperIds: input.technicianId ? input.helperIds : undefined,
        workBayId: input.workBayId,
        excludeId: input.excludeId,
      })
      return slot
        ? { start: slot.start.toISOString(), end: slot.end.toISOString() }
        : { start: null, end: null }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_ORDERS },
      ],
    }
  )
}

/**
 * How full each technician's day is, for the day a job is booked on: minutes
 * already booked, this job included, so the desk can see who has room before
 * putting a name on the work. The day is the workshop's calendar day, not the
 * server's.
 */
export async function getTechnicianDayLoad(input: { day: string }) {
  return withAuth(
    async ({ organizationId }) => {
      const day = new Date(input.day)
      if (Number.isNaN(day.getTime()))
        return { minutes: {} as Record<string, number>, away: {} as Record<string, AwayOnDay> }

      const { bookings, hours } = await loadBookingContext(organizationId, day)
      const timeZone = hours.timeZone ?? 'UTC'
      const dayStart = startOfZonedDay(day, timeZone)
      const dayEnd = addZonedDays(dayStart, 1, timeZone)
      // Who is away that day, so the picker can say so beside their name.
      const away: Record<string, AwayOnDay> = {}
      const calendar = hours.calendar
      if (calendar) {
        const key = dayOf(day, timeZone)
        for (const absence of absencesOn(calendar, key)) {
          away[absence.technicianId] = {
            reason: absence.reason,
            allDay: awayAllDay(calendar, absence, key),
            from: key === absence.startDate ? (absence.startTime ?? null) : null,
            until: key === absence.endDate ? (absence.endTime ?? null) : null,
          }
        }
      }
      return { minutes: technicianMinutesInDay(bookings, dayStart, dayEnd), away }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_ORDERS },
      ],
    }
  )
}

/** A technician's time off on one day, as the technician picker shows it. */
export interface AwayOnDay {
  reason: string
  /** Away for the whole of the workshop's day. */
  allDay: boolean
  /** "HH:mm" they leave, when it is part of the day. */
  from: string | null
  /** "HH:mm" they are back, when it is part of the day. */
  until: string | null
}
