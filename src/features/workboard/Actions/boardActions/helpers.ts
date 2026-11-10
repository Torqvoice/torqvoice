'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { notificationBus } from '@/lib/notification-bus'
import { pushToTechnician } from '@/features/notifications/Lib/pushToTechnician'
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

      const [record, technician] = await Promise.all([
        db.serviceRecord.findFirst({
          where: { id: data.id, organizationId },
          select: { id: true, technicianId: true },
        }),
        // Active only: somebody who has left cannot be put on new work.
        db.technician.findFirst({
          where: { id: data.technicianId, organizationId, isActive: true },
          select: { id: true },
        }),
      ])
      if (!record) throw new Error('Service record not found')
      if (!technician) throw new Error('Technician not found')
      if (!record.technicianId) throw new Error('Choose a technician for the job first')

      // Already the technician: on the job, and not as a helper.
      if (record.technicianId !== technician.id) {
        const added = await db.serviceRecordHelper.createMany({
          data: [{ organizationId, serviceRecordId: record.id, technicianId: technician.id }],
          // A second tap, or two desks adding the same person at once.
          skipDuplicates: true,
        })

        const job = await announceJob(organizationId, record.id)

        // Tells their phone, as assigning the job tells the technician's.
        // Not awaited, and only when this call is the one that added them.
        if (added.count > 0) {
          void pushToTechnician({
            organizationId,
            technicianId: technician.id,
            message: {
              title: 'New job assignment',
              body: [job.vehicle?.licensePlate?.trim(), job.title].filter(Boolean).join(' · '),
              data: { jobId: record.id },
            },
          })
        }
        return job
      }

      return announceJob(organizationId, record.id)
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

      const record = await db.serviceRecord.findFirst({
        where: { id: data.id, organizationId },
        select: { id: true },
      })
      if (!record) throw new Error('Service record not found')

      // Nothing to remove is not an error: the other desk got there first.
      await db.serviceRecordHelper.deleteMany({
        where: { serviceRecordId: record.id, organizationId, technicianId: data.technicianId },
      })

      return announceJob(organizationId, record.id)
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.WORK_BOARD },
      ],
    }
  )
}
