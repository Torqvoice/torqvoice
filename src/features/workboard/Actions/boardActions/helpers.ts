'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { notificationBus } from '@/lib/notification-bus'
import { pushToTechnician } from '@/features/notifications/Lib/pushToTechnician'
import { lockJobTeam } from '../../Lib/jobTeam'
import { jobHelperSchema } from '../../Schema/workboardSchema'
import { SERVICE_JOB_SELECT, serviceRecordToJob } from './mappers'

/**
 * Putting a second person on a job, and taking them off it.
 *
 * The job's technician is set by `assignTechnician` and `scheduleJob` and is
 * not touched here: a helper is somebody working the job with that
 * technician, so there has to be one first, and the technician cannot also
 * be their own helper. Lib/jobTeam.ts has the rules.
 */

/** The job as the board draws it, announced to every board that is open. */
async function announceJob(organizationId: string, serviceRecordId: string) {
  const sr = await db.serviceRecord.findFirstOrThrow({
    where: { id: serviceRecordId, organizationId },
    select: SERVICE_JOB_SELECT,
  })
  const job = serviceRecordToJob(sr)
  notificationBus.emit('workboard', { type: 'job_scheduled', organizationId, job })
  revalidatePath('/work-board')
  revalidatePath('/vehicles')
  return job
}

export async function addJobHelper(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = jobHelperSchema.parse(input)

      // Active only: somebody who has left cannot be put on new work.
      const technician = await db.technician.findFirst({
        where: { id: data.technicianId, organizationId, isActive: true },
        select: { id: true },
      })
      if (!technician) throw new Error('Technician not found')

      // Checked and written under the job's lock, so a desk taking the
      // technician off, or making this person the technician, cannot land
      // between the check and the insert.
      const added = await db.$transaction(async (tx) => {
        const team = await lockJobTeam(tx, { organizationId, serviceRecordId: data.id })
        if (!team) throw new Error('Service record not found')
        if (!team.technicianId) throw new Error('Choose a technician for the job first')
        // Already the technician: on the job, and not as a helper.
        if (team.technicianId === technician.id) return 0
        const result = await tx.serviceRecordHelper.createMany({
          data: [{ organizationId, serviceRecordId: data.id, technicianId: technician.id }],
          // A second tap, or two desks adding the same person at once.
          skipDuplicates: true,
        })
        return result.count
      })

      const job = await announceJob(organizationId, data.id)

      // Tells their phone, as assigning the job tells the technician's.
      // Not awaited, and only when this call is the one that added them.
      if (added > 0) {
        void pushToTechnician({
          organizationId,
          technicianId: technician.id,
          message: {
            title: 'New job assignment',
            body: [job.vehicle?.licensePlate?.trim(), job.title].filter(Boolean).join(' · '),
            data: { jobId: data.id },
          },
        })
      }
      return job
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD },
      ],
    }
  )
}

export async function removeJobHelper(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = jobHelperSchema.parse(input)

      // Under the same lock as adding a helper and changing the technician,
      // so this cannot interleave with a desk making this person the lead.
      await db.$transaction(async (tx) => {
        const team = await lockJobTeam(tx, { organizationId, serviceRecordId: data.id })
        if (!team) throw new Error('Service record not found')
        // Nothing to remove is not an error: the other desk got there first.
        await tx.serviceRecordHelper.deleteMany({
          where: { serviceRecordId: data.id, organizationId, technicianId: data.technicianId },
        })
      })

      return announceJob(organizationId, data.id)
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD },
      ],
    }
  )
}
