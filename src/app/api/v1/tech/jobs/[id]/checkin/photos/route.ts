import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { discardUnsavedUpload } from '@/lib/files/manager'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { assertContentLength } from '@/lib/backup/zip-guard'
import { isDropoffSlot } from '@/lib/dropoff-slots'
import { checkinJobFor, noteArrival } from '@/features/condition-map/Lib/checkinAccess.server'
import {
  MAX_CHECKIN_PHOTO_BYTES,
  PHOTO_REFUSALS,
  saveCheckinPhoto,
} from '@/features/condition-map/Lib/checkinPhoto.server'

/**
 * A drop-off photo from the walk round the car: front, right, rear, left, the
 * odometer, or damage. Stored as the web's photo walk stores one, so it shows
 * under Files & media → Drop-off with the position it was taken from.
 *
 * Not on the invoice: it is the workshop's record of the car as it arrived,
 * for the day somebody says a scratch is new. The desk can still choose to
 * show one. A retake is a DELETE of the old one through the attachments
 * route, then a new one here.
 */

/** As many as the phone walk allows on one job. */
const DROPOFF_PER_JOB = 30

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params
      const job = await checkinJobFor(ctx, id)
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')

      try {
        assertContentLength(request, MAX_CHECKIN_PHOTO_BYTES + 1024 * 1024)
      } catch {
        return apiError(413, 'invalid_request', PHOTO_REFUSALS.tooLarge)
      }
      const form = await request.formData().catch(() => null)
      const slotField = form?.get('slot')
      const slot = isDropoffSlot(slotField) ? slotField : 'other'

      const onJob = await db.serviceAttachment.count({
        where: { serviceRecordId: job.id, category: 'dropoff' },
      })
      if (onJob >= DROPOFF_PER_JOB) {
        return apiError(
          409,
          'conflict',
          `This job already has the maximum of ${DROPOFF_PER_JOB} drop-off photos.`
        )
      }

      const saved = await saveCheckinPhoto(ctx.organizationId, form?.get('file') ?? null)
      if ('refused' in saved) return apiError(400, 'invalid_request', PHOTO_REFUSALS[saved.refused])
      await noteArrival(ctx.organizationId, job)

      // The file is only kept if its row is: a file on disk that no attachment
      // points at is one nothing will ever delete.
      const attachment = await db.serviceAttachment
        .create({
          data: {
            fileName: saved.fileName,
            fileUrl: saved.url,
            fileType: 'image/jpeg',
            fileSize: saved.size,
            category: 'dropoff',
            includeInInvoice: false,
            description: slot,
            serviceRecordId: job.id,
          },
          select: { id: true, description: true, fileUrl: true, createdAt: true },
        })
        .catch(async (err) => {
          await discardUnsavedUpload(ctx.organizationId, 'services', saved.filename)
          throw err
        })

      await logAudit(ctx, {
        action: 'service.update',
        entity: 'ServiceRecord',
        entityId: job.id,
        details: { key: 'service_update', params: { ref: job.ref } },
        metadata: { serviceRecordId: job.id, attachmentId: attachment.id, via: 'tech-checkin' },
      })

      return apiOk(
        {
          photo: {
            id: attachment.id,
            slot,
            url: attachment.fileUrl,
            createdAt: attachment.createdAt.toISOString(),
          },
        },
        201
      )
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      // A walk is six shots and a few of damage, sent as fast as they are taken.
      rateLimit: { limit: 60, windowMs: 60_000 },
    }
  )
}
