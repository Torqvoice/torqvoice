import {
  CANCELLED,
  isCancelled,
  slotOnCompletion,
  statusColumns,
} from '@/features/work-order-statuses/Lib/stages'
import { CANCELLED_JOB_REFUSAL } from '@/features/invoices/Lib/cancelInvoice'
import { z } from 'zod'
import { announceJobStatusChanged } from '@/features/vehicles/Lib/jobEvents'
import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { stopJobClocks } from '@/features/time-tracking/Lib/timeEntries'
import { notify } from '@/lib/notify'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { jobScopeFor } from '@/features/workboard/Lib/jobTeam'
import {
  missingRequiredMeters,
  requiredMetersRefusal,
} from '@/features/meters/Lib/requiredMeters.server'

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
 *
 * A job the workshop asks meter readings of is not completed without them:
 * 409 `meters_required`, the message naming the meters ("Not completed. Fill
 * in: PTO hours"), and `details: { meters: [{ vehicleMeterId, meterTypeId,
 * name, item }] }`, `item` null for the vehicle's own meter, else the piece
 * of equipment's `{ id, label }`. The readings go in through
 * `PUT /jobs/:id/meters`; each meter there says whether it is `required`.
 * Nothing about the job changes, its clocks included.
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
          ...jobScopeFor(ctx),
        },
        select: {
          id: true,
          status: true,
          title: true,
          startDateTime: true,
          endDateTime: true,
          vehicleId: true,
          // Enough for the board to draw the card if this puts the job back
          // in its unassigned list.
          vehicle: {
            select: { id: true, make: true, model: true, year: true, licensePlate: true },
          },
        },
      })
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')
      // Its invoice went out and was called off; nothing moves it on again.
      if (isCancelled(job.status)) return apiError(409, 'conflict', CANCELLED_JOB_REFUSAL)

      // Before anything moves, the clocks included: the readings the
      // workshop requires, for a job being completed now.
      if (status === 'completed' && job.status !== 'completed') {
        const missing = await missingRequiredMeters(ctx.organizationId, job.id, 'complete')
        if (missing.length > 0) {
          const refusal = await requiredMetersRefusal('complete', missing)
          return apiError(409, 'meters_required', refusal.message, { meters: missing })
        }
      }

      // Conditional on the job not having been cancelled since it was read,
      // so a tap already on its way cannot undo a cancel; the clocks are
      // only touched once the move has really happened.
      const moved = await db.serviceRecord.updateMany({
        where: { id: job.id, organizationId: ctx.organizationId, status: { not: CANCELLED } },
        // The phone moves the stage; a status of the workshop's own belonged
        // to the stage it left, and a finished job lets go of booked time
        // still ahead of it.
        data: { ...statusColumns(status), ...slotOnCompletion(job, status) },
      })
      if (moved.count === 0) return apiError(409, 'conflict', CANCELLED_JOB_REFUSAL)
      const updated = { id: job.id, status }

      // Finishing a job stops the clock on it. A technician who has moved on
      // is not going to remember, and a clock left running past the end of the
      // work is the exact error the whole feature exists to prevent.
      //
      // Every clock on it, not only this person's: with two people on a job,
      // the one who taps "finished" speaks for both, and the other's clock
      // would otherwise run on against work that is over.
      let stoppedMinutes: number | null = null
      if (status === 'completed' || status === 'waiting-parts') {
        const stopped = await stopJobClocks({
          organizationId: ctx.organizationId,
          serviceRecordId: job.id,
        })
        // The app shows the caller how long their own stretch was.
        stoppedMinutes =
          stopped.find((e) => ctx.technicianIds.includes(e.technicianId))?.durationMinutes ?? null
      }

      const technician = await db.technician.findFirst({
        where: { id: { in: ctx.technicianIds } },
        select: { name: true },
      })

      // Puts it on the desk's screens immediately: the board moves the card,
      // and a work order page open on this job moves its status bar. Same
      // event the web's own status change sends, so both have one listener.
      announceJobStatusChanged({
        organizationId: ctx.organizationId,
        serviceRecordId: updated.id,
        status: updated.status,
        serviceRecord: {
          id: job.id,
          title: job.title,
          status: updated.status,
          vehicle: job.vehicle,
        },
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
