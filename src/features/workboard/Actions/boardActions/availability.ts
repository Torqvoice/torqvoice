'use server'

import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { findConflicts, nextAvailableSlot } from '../../Lib/availability'
import { loadBookingContext } from '../../Lib/bookings'

/**
 * Is this slot free, and if not, where is the next one.
 *
 * The board lets a technician and a bay be set independently, so a booking
 * can clash on either. Both questions read the same window of work, and both
 * count inspections, which hold a bay and a person exactly as a job does.
 */

/** What a proposed booking would collide with. Empty means the slot is free. */
export async function checkSlotAvailability(input: {
  start: string
  end: string
  technicianId?: string | null
  workBayId?: string | null
  /** The job being edited, so it never clashes with itself. */
  excludeId?: string
}) {
  return withAuth(
    async ({ organizationId }) => {
      const start = new Date(input.start)
      const end = new Date(input.end)
      if (!(start < end)) return { conflicts: [] }
      // Nothing is held, so nothing can be clashed with.
      if (!input.technicianId && !input.workBayId) return { conflicts: [] }

      const { bookings } = await loadBookingContext(organizationId, start)
      const conflicts = findConflicts(
        { start, end, technicianId: input.technicianId, workBayId: input.workBayId },
        bookings,
        input.excludeId
      )
      return {
        conflicts: conflicts.map((c) => ({
          id: c.id,
          kind: c.kind,
          label: c.label,
          start: c.start.toISOString(),
          end: c.end.toISOString(),
          // Which resource actually clashed, so the warning can say so rather
          // than leaving somebody to work it out from two times.
          onTechnician: !!input.technicianId && c.technicianId === input.technicianId,
          onBay: !!input.workBayId && c.workBayId === input.workBayId,
        })),
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
