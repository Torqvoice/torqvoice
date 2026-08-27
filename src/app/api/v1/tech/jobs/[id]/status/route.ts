import { z } from 'zod'
import { db } from '@/lib/db'
import { notificationBus } from '@/lib/notification-bus'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { getOpenEntry, stopEntry } from '@/features/time-tracking/Lib/timeEntries'

/**
 * Moves a job along.
 *
 * Without this the app can start work but never finish it: the job list shows
 * pending, in-progress and waiting-parts, and a job the technician has
 * completed sits on their phone forever because nothing can take it off.
 *
 * `completed` is deliberately reachable from here, and nothing beyond it is.
 * Invoicing, pricing and everything downstream stay with the office; a
 * technician saying "I have finished" is a statement about the work, not a
 * decision to bill for it.
 */
const bodySchema = z.object({
  status: z.enum(['pending', 'in-progress', 'waiting-parts', 'completed']),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params
      const { status } = bodySchema.parse(await request.json())

      const job = await db.serviceRecord.findFirst({
        where: {
          id,
          organizationId: ctx.organizationId,
          ...(ctx.isAdmin ? {} : { technicianId: { in: ctx.technicianIds } }),
        },
        select: { id: true, status: true, title: true },
      })
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')

      // Finishing a job stops the clock on it. A technician who has moved on
      // is not going to remember, and a clock left running past the end of the
      // work is the exact error the whole feature exists to prevent.
      let stoppedMinutes: number | null = null
      if (status === 'completed' || status === 'waiting-parts') {
        const open = await getOpenEntry(ctx.organizationId, ctx.technicianIds)
        if (open?.serviceRecordId === job.id) {
          const entry = await stopEntry({
            organizationId: ctx.organizationId,
            technicianIds: ctx.technicianIds,
          })
          stoppedMinutes = entry.durationMinutes
        }
      }

      const updated = await db.serviceRecord.update({
        where: { id: job.id },
        data: { status },
        select: { id: true, status: true },
      })

      // Puts it on the work board immediately, the same way the board's own
      // changes reach the technician.
      notificationBus.emit('workboard', {
        type: 'job_updated',
        organizationId: ctx.organizationId,
        job: updated,
      })

      return apiOk({ job: updated, stoppedMinutes })
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
