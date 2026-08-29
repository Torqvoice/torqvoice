import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { getOpenEntry } from '@/features/time-tracking/Lib/timeEntries'

/**
 * One job, with everything the technician needs while standing at the car.
 *
 * Scoped to the organization, and then to the technician's own rows unless
 * they are an admin. A technician who guesses another job's id gets a 404
 * rather than a 403: whether a job exists in someone else's bay is not
 * information this endpoint should confirm.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params

      const job = await db.serviceRecord.findFirst({
        where: {
          id,
          organizationId: ctx.organizationId,
          ...(ctx.isAdmin ? {} : { technicianId: { in: ctx.technicianIds } }),
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          diagnosticNotes: true,
          mileage: true,
          startDateTime: true,
          endDateTime: true,
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              licensePlate: true,
              vin: true,
              mileage: true,
              customer: { select: { id: true, name: true, phone: true, email: true } },
            },
          },
          customer: { select: { id: true, name: true, phone: true, email: true } },
          partItems: {
            select: { id: true, name: true, quantity: true, unit: true, partNumber: true },
            orderBy: { id: 'asc' },
          },
          laborItems: {
            select: { id: true, description: true, hours: true },
            orderBy: { id: 'asc' },
          },
          attachments: {
            select: {
              id: true,
              category: true,
              fileUrl: true,
              fileName: true,
              fileType: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 30,
          },
          timeEntries: {
            select: { id: true, startedAt: true, endedAt: true, durationMinutes: true, note: true },
            orderBy: { startedAt: 'desc' },
            take: 20,
          },
        },
      })

      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')

      const openEntry = await getOpenEntry(ctx.organizationId, ctx.technicianIds)
      const totalMinutes = job.timeEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0)

      return apiOk({
        ...job,
        customer: job.customer ?? job.vehicle?.customer ?? null,
        isRunning: openEntry?.serviceRecordId === job.id,
        runningSince: openEntry?.serviceRecordId === job.id ? openEntry.startedAt : null,
        totalMinutes,
      })
    },
    {
      requireTechnician: true,
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}
