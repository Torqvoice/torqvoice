'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { loadBookingContext } from '@/features/workboard/Lib/bookings'
import { ACTIVE_HELPERS } from '@/features/workboard/Lib/jobTeam'
import { buildVehicleJobWarnings } from '../Lib/vehicleJobWarnings'

/** The most jobs one vehicle is checked for: more than any car is booked in for at once. */
const MAX_JOBS = 25
const DAY_MS = 86_400_000

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

      // One read of the workshop's bookings, closures and leave, from the
      // first job's start to past the last one's end.
      const from = booked[0].start
      const last = Math.max(...booked.map((job) => job.end.getTime()))
      const context = await loadBookingContext(organizationId, from, {
        days: Math.ceil((last - from.getTime()) / DAY_MS) + 1,
      })

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
        context,
        new Map(technicians.map((t) => [t.id, t.name]))
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
