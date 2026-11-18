import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiOk, withApiAuth } from '@/lib/with-api-auth'
import { getOpenEntry } from '@/features/time-tracking/Lib/timeEntries'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { addZonedDays, startOfZonedDay } from '@/lib/timezone'
import { onJobWhere } from '@/features/workboard/Lib/jobTeam'

/** Statuses that mean "this is on my plate right now". */
const ACTIVE_STATUSES = ['in-progress', 'pending', 'waiting-parts']

/**
 * The technician's own job list, which is the app's home screen.
 *
 * Scoped to their technician rows, never to a client-supplied id: the app
 * cannot ask for somebody else's work by changing a parameter. Their own
 * work is every job they are on, as its technician or helping on it. Counts are
 * included so the list can show what a job already has without a request per
 * row, which matters on a phone holding twenty of them.
 */
export async function GET(request: Request) {
  return withApiAuth(
    request,
    async (ctx) => {
      // A booking (an online one, or one the desk made ahead) is `scheduled`
      // until work starts. From its day on it is the car arriving, the one a
      // technician checks in, so it is on the list; a booking for next week
      // is not yet.
      const timeZone = await workshopTimeZone(ctx.organizationId)
      const endOfToday = addZonedDays(startOfZonedDay(new Date(), timeZone), 1, timeZone)
      const records = await db.serviceRecord.findMany({
        where: {
          organizationId: ctx.organizationId,
          AND: [
            // Theirs, or one they are helping on: a helper has the job on
            // their list exactly as its technician does.
            onJobWhere(ctx.technicianIds),
            {
              OR: [
                { status: { in: ACTIVE_STATUSES } },
                { status: 'scheduled', startDateTime: { lt: endOfToday } },
              ],
            },
          ],
        },
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
          startDateTime: true,
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              licensePlate: true,
              customer: { select: { id: true, name: true, phone: true, email: true } },
            },
          },
          customer: { select: { id: true, name: true, phone: true, email: true } },
          attachments: { select: { category: true } },
          _count: { select: { partItems: true, laborItems: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      })

      const openEntry = await getOpenEntry(ctx.organizationId, ctx.technicianIds)

      return apiOk({
        openEntryJobId: openEntry?.serviceRecordId ?? null,
        jobs: records.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          updatedAt: r.updatedAt,
          scheduledFor: r.startDateTime,
          vehicle: r.vehicle
            ? {
                id: r.vehicle.id,
                make: r.vehicle.make,
                model: r.vehicle.model,
                year: r.vehicle.year,
                licensePlate: r.vehicle.licensePlate,
              }
            : null,
          // A vehicle-linked job resolves its customer through the vehicle, so
          // the app never has to know which of the two carried it.
          customer: r.customer ?? r.vehicle?.customer ?? null,
          imageCount: r.attachments.filter((a) => a.category === 'image').length,
          videoCount: r.attachments.filter((a) => a.category === 'video').length,
          partCount: r._count.partItems,
          laborCount: r._count.laborItems,
          isRunning: openEntry?.serviceRecordId === r.id,
        })),
      })
    },
    {
      requireTechnician: true,
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}
