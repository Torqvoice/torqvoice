import { z } from 'zod'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { startEntry, TimeEntryError } from '@/features/time-tracking/Lib/timeEntries'

const bodySchema = z.object({
  serviceRecordId: z.string().min(1),
})

/**
 * Start the clock on a job.
 *
 * Starting a second job closes the first rather than refusing, because that is
 * what the technician meant: they moved. See `startEntry` for why.
 */
export async function POST(request: Request) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { serviceRecordId } = bodySchema.parse(await request.json())

      try {
        // The user may hold several technician rows; the clock is booked
        // against the first, which is the one the board treats as primary.
        const result = await startEntry({
          organizationId: ctx.organizationId,
          technicianId: ctx.technicianIds[0],
          technicianIds: ctx.technicianIds,
          serviceRecordId,
          source: 'app',
        })

        return apiOk({
          entry: {
            id: result.entry.id,
            startedAt: result.entry.startedAt,
            serviceRecordId: result.entry.serviceRecordId,
            jobTitle: result.entry.serviceRecord.title,
          },
          // The app shows "stopped X, started Y" so a mis-tap is visible
          // immediately rather than discovered on the timesheet.
          closed: result.closed,
        })
      } catch (err) {
        if (err instanceof TimeEntryError) {
          if (err.code === 'job_not_found') return apiError(404, 'not_found', err.message)
          return apiError(409, 'conflict', err.message)
        }
        throw err
      }
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
