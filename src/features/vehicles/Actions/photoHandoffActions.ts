'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { createPhotoHandoffToken } from '@/lib/photo-handoff'

/**
 * A code for the work order's "Add photos from phone": a signed link that
 * lets a phone that is not signed in add photos to this job, and nothing else,
 * for half an hour. See src/lib/photo-handoff.ts.
 *
 * Only somebody who could add the photos themselves can hand the job to a
 * phone, and a concern has to belong to the job it is filed under.
 */
export async function createPhotoHandoffLink(input: {
  serviceRecordId: string
  concernId?: string | null
}) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const job = await db.serviceRecord.findFirst({
        where: { id: input.serviceRecordId, organizationId },
        select: { id: true },
      })
      if (!job) throw new Error('Work order not found')

      let concernId: string | null = null
      if (input.concernId) {
        const concern = await db.serviceConcern.findFirst({
          where: { id: input.concernId, serviceRecordId: job.id },
          select: { id: true },
        })
        if (!concern) throw new Error('Concern not found')
        concernId = concern.id
      }

      const { token, expiresAt } = createPhotoHandoffToken({
        organizationId,
        serviceRecordId: job.id,
        concernId,
        userId,
      })
      return { token, expiresAt: expiresAt.toISOString() }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}

/**
 * How many photos and documents have reached the job since the code was shown. The desk's
 * dialog asks every few seconds and refreshes the page when the number moves,
 * which is far lighter than re-rendering the whole work order on a timer.
 */
export async function countPhotosSince(input: { serviceRecordId: string; since: string }) {
  return withAuth(
    async ({ organizationId }) => {
      const since = new Date(input.since)
      if (Number.isNaN(since.getTime())) throw new Error('Invalid time')
      return db.serviceAttachment.count({
        where: {
          serviceRecordId: input.serviceRecordId,
          serviceRecord: { organizationId },
          category: { in: ['image', 'document'] },
          createdAt: { gte: since },
        },
      })
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}
