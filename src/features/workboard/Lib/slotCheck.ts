import { findConflicts, sharedPeople } from './availability'
import { type BookingContext, loadBookingContext } from './bookings'
import { closuresDuring, dayOf, dayState } from '@/features/workshop-calendar/Lib/calendar'

export interface SlotCheckInput {
  start: Date
  end: Date
  technicianId?: string | null
  /** Who else is on the job: their day has to be free as well. */
  helperIds?: string[]
  workBayId?: string | null
  /** The job being checked, so it never clashes with itself. */
  excludeId?: string
}

export interface SlotCheck {
  conflicts: {
    id: string
    /** `absence` is a technician's time off rather than other work. */
    kind: 'serviceRecord' | 'inspection' | 'absence'
    label: string
    start: Date
    end: Date
    /** Which resource clashed, so a warning can say so. */
    onTechnician: boolean
    onBay: boolean
    /** Who on the job is double-booked, as technician ids. */
    people: string[]
  }[]
  /** The workshop's own closures the slot falls in. */
  closures: { name: string; source: string }[]
  /** The slot is on a weekday the workshop is normally closed. */
  closedWeekday: boolean
}

/**
 * What a booking collides with: other work holding the same person or bay,
 * a technician's time off, and any day the workshop is closed. Nothing here
 * refuses the booking, the desk may agree overtime; it is what the warnings
 * on a work order, and on its vehicle's page, are made from, so both always
 * say the same thing.
 */
export async function checkSlot(organizationId: string, input: SlotCheckInput): Promise<SlotCheck> {
  if (!(input.start < input.end)) return { conflicts: [], closures: [], closedWeekday: false }
  return checkSlotIn(await loadBookingContext(organizationId, input.start), input)
}

/**
 * The same check against a context already loaded, so a page asking about
 * several jobs reads the workshop's bookings once. The context has to cover
 * the slot: `loadBookingContext` from the slot's start, or from the earliest
 * of several with `days` reaching past the last.
 */
export function checkSlotIn(context: BookingContext, input: SlotCheckInput): SlotCheck {
  const { start, end } = input
  if (!(start < end)) return { conflicts: [], closures: [], closedWeekday: false }

  const { bookings, hours, closuresEnabled } = context
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
  const conflicts = findConflicts(slot, bookings, input.excludeId).map((c) => {
    const people = sharedPeople(slot, c)
    return {
      id: c.id,
      kind: c.kind,
      label: c.label,
      start: c.start,
      end: c.end,
      onTechnician: people.length > 0,
      onBay: !!input.workBayId && c.workBayId === input.workBayId,
      people,
    }
  })
  return { conflicts, closures, closedWeekday }
}
