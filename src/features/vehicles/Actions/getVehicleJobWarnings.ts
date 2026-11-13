'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { loadBookingContext, MAX_WINDOW_DAYS } from '@/features/workboard/Lib/bookings'
import { ACTIVE_HELPERS } from '@/features/workboard/Lib/jobTeam'
import {
  buildVehicleJobWarnings,
  planWindows,
  type Span,
  splitSpan,
} from '../Lib/vehicleJobWarnings'

/** The most jobs one vehicle is checked for: more than any car is booked in for at once. */
const MAX_JOBS = 25
const DAY_MS = 86_400_000
/**
 * How many days one read of the bookings covers here: under the loader's
 * limit, which also reads a day either side.
 */
const WINDOW_DAYS = MAX_WINDOW_DAYS - 2

/**
 * What is wrong with the bookings of a vehicle's open jobs: the technician or
 * a helper away, the workshop closed, the person or bay already taken. The
 * same check the work order runs when it opens (workboard/Lib/slotCheck), so
 * the vehicle page warns about exactly what the job will show once opened.
 *
 * Only jobs still to be done and not yet over: a clash in a slot that has
 * passed is history, not something anybody can fix.
 */
export async function getVehicleJobWarnings(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const id = z.string().min(1).parse(vehicleId)
      const now = new Date()
      const jobs = await db.serviceRecord.findMany({
        where: {
          organizationId,
          vehicleId: id,
          status: { notIn: ['completed', 'cancelled'] },
          startDateTime: { not: null },
          endDateTime: { gt: now },
        },
        orderBy: { startDateTime: 'asc' },
        take: MAX_JOBS,
        select: {
          id: true,
          title: true,
          invoiceNumber: true,
          startDateTime: true,
          endDateTime: true,
          technicianId: true,
          workBayId: true,
          helpers: { ...ACTIVE_HELPERS, select: { technicianId: true } },
        },
      })
      const booked = jobs.flatMap((job) =>
        job.startDateTime && job.endDateTime && job.startDateTime < job.endDateTime
          ? [{ ...job, start: job.startDateTime, end: job.endDateTime }]
          : []
      )
      if (booked.length === 0) return []

      // The workshop's bookings, closures and leave are read once per window
      // of days that covers the jobs, usually one: a read has a limit, and
      // jobs further apart than that, or one longer, get windows of their own.
      const pieces = booked.flatMap((job) => splitSpan(job, WINDOW_DAYS))
      const windows = await Promise.all(
        planWindows(pieces, WINDOW_DAYS).map(async (window) => ({
          window,
          context: await loadBookingContext(organizationId, window.start, {
            days: Math.ceil((window.end.getTime() - window.start.getTime()) / DAY_MS) + 1,
          }),
        }))
      )
      const contextFor = (span: Span) => {
        const found = windows.find(
          ({ window }) => span.start >= window.start && span.end <= window.end
        )
        if (!found) throw new Error('No bookings read for a job on this vehicle')
        return found.context
      }

      const technicians = await db.technician.findMany({
        where: { organizationId },
        select: { id: true, name: true },
      })

      return buildVehicleJobWarnings(
        booked.map((job) => ({
          id: job.id,
          title: job.title,
          invoiceNumber: job.invoiceNumber,
          start: job.start,
          end: job.end,
          technicianId: job.technicianId,
          helperIds: job.helpers.map((h) => h.technicianId),
          workBayId: job.workBayId,
        })),
        contextFor,
        new Map(technicians.map((t) => [t.id, t.name])),
        WINDOW_DAYS
      )
    },
    {
      // What the work order asks to show the same warnings.
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_ORDERS },
      ],
    }
  )
}
