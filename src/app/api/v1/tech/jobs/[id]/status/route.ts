import { z } from 'zod'
import { db } from '@/lib/db'
import { notificationBus } from '@/lib/notification-bus'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { getOpenEntry, stopEntry } from '@/features/time-tracking/Lib/timeEntries'
import { notify } from '@/lib/notify'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

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
        select: {
          id: true,
          status: true,
          title: true,
          vehicleId: true,
          vehicle: { select: { licensePlate: true } },
        },
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

      const technician = await db.technician.findFirst({
        where: { id: { in: ctx.technicianIds } },
        select: { name: true },
      })

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

      // Tells the desk, unless the shop has turned it off.
      //
      // The whole point of the app is that the office stops walking into the
      // bay to ask, which only works if the office finds out. Not awaited: the
      // status change succeeded the moment the row was written, and a
      // notification failing must not undo it.
      void notifyDesk({
        organizationId: ctx.organizationId,
        jobId: job.id,
        vehicleId: job.vehicleId,
        label: [job.vehicle?.licensePlate?.trim(), job.title].filter(Boolean).join(' · '),
        technicianName: technician?.name ?? 'A technician',
        status,
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

/** How each status reads to somebody at the desk. */
const STATUS_WORDS: Record<string, string> = {
  completed: 'finished',
  'waiting-parts': 'is waiting for parts',
  'in-progress': 'is back in progress',
  pending: 'is back on the list',
}

async function notifyDesk(args: {
  organizationId: string
  jobId: string
  vehicleId: string | null
  label: string
  technicianName: string
  status: string
}) {
  try {
    const setting = await db.appSetting.findFirst({
      where: {
        organizationId: args.organizationId,
        key: SETTING_KEYS.TECHNICIAN_STATUS_ALERTS,
      },
      select: { value: true },
    })

    // Absent means on. A shop that has never opened the setting should still
    // be told; opting out has to be a decision somebody made.
    if (setting?.value === 'false') return

    const words = STATUS_WORDS[args.status] ?? `moved to ${args.status}`
    await notify({
      organizationId: args.organizationId,
      type: 'job.statusChanged',
      title:
        args.status === 'completed'
          ? `${args.technicianName} finished a job`
          : `${args.technicianName} updated a job`,
      message: `${args.label} ${words}.`,
      entityType: 'ServiceRecord',
      entityId: args.jobId,
      entityUrl: args.vehicleId
        ? `/vehicles/${args.vehicleId}/service/${args.jobId}`
        : `/sales/${args.jobId}`,
    })
  } catch (err) {
    console.error('[status] could not notify the desk', err)
  }
}
