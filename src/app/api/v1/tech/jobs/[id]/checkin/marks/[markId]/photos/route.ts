import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { assertContentLength } from '@/lib/backup/zip-guard'
import { discardUnsavedUpload } from '@/lib/files/manager'
import { appendMarkPhoto, removeMarkPhoto } from '@/features/condition-map/Lib/markStore.server'
import { checkinMarkList } from '@/features/condition-map/Lib/checkin.server'
import {
  answeringRefusals,
  appLocale,
  checkinJobFor,
  editableMark,
} from '@/features/condition-map/Lib/checkinAccess.server'
import {
  MAX_CHECKIN_PHOTO_BYTES,
  PHOTO_REFUSALS,
  saveCheckinPhoto,
} from '@/features/condition-map/Lib/checkinPhoto.server'

type Params = { params: Promise<{ id: string; markId: string }> }

/**
 * A close-up of the damage a mark records, from the technician app. One
 * photo a request, as the camera takes them; the web's mark editor shows it
 * at once and the print sets it under the map.
 */

/** As many as a mark on the web can take. */
const PHOTOS_PER_MARK = 10

const UPDATE_SERVICES = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES }]

export async function POST(request: Request, { params }: Params) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id, markId } = await params
      const job = await checkinJobFor(ctx, id)
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')
      const mark = await editableMark(ctx.organizationId, job, markId)
      if (!mark) return apiError(404, 'not_found', 'That mark is not on this check-in.')
      if (mark.imageUrls.length >= PHOTOS_PER_MARK) {
        return apiError(409, 'conflict', `A mark can have at most ${PHOTOS_PER_MARK} photos.`)
      }

      try {
        assertContentLength(request, MAX_CHECKIN_PHOTO_BYTES + 1024 * 1024)
      } catch {
        return apiError(413, 'invalid_request', PHOTO_REFUSALS.tooLarge)
      }
      const form = await request.formData().catch(() => null)
      const saved = await saveCheckinPhoto(ctx.organizationId, form?.get('file') ?? null)
      if ('refused' in saved) return apiError(400, 'invalid_request', PHOTO_REFUSALS[saved.refused])

      return answeringRefusals(async () => {
        // The photo is only kept if the mark holds it.
        let added: Awaited<ReturnType<typeof appendMarkPhoto>>
        try {
          added = await appendMarkPhoto(ctx.organizationId, markId, saved.url, PHOTOS_PER_MARK)
        } catch (err) {
          await discardUnsavedUpload(ctx.organizationId, 'services', saved.filename)
          throw err
        }
        if (!added) {
          await discardUnsavedUpload(ctx.organizationId, 'services', saved.filename)
          return apiError(409, 'conflict', `A mark can have at most ${PHOTOS_PER_MARK} photos.`)
        }
        const marks = await checkinMarkList(
          ctx.organizationId,
          job.vehicleId,
          job.scope,
          await appLocale(request, ctx.organizationId)
        )
        return apiOk({ url: saved.url, marks }, 201)
      })
    },
    {
      requireTechnician: true,
      requiredPermissions: UPDATE_SERVICES,
      rateLimit: { limit: 60, windowMs: 60_000 },
    }
  )
}

/** `?url=` names the photo to take off the mark. */
export async function DELETE(request: Request, { params }: Params) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id, markId } = await params
      const job = await checkinJobFor(ctx, id)
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')
      const mark = await editableMark(ctx.organizationId, job, markId)
      if (!mark) return apiError(404, 'not_found', 'That mark is not on this check-in.')
      const url = new URL(request.url).searchParams.get('url') ?? ''
      if (!mark.imageUrls.includes(url)) {
        return apiError(404, 'not_found', 'That photo is not on this mark.')
      }

      return answeringRefusals(async () => {
        await removeMarkPhoto(ctx.organizationId, markId, url)
        const marks = await checkinMarkList(
          ctx.organizationId,
          job.vehicleId,
          job.scope,
          await appLocale(request, ctx.organizationId)
        )
        return apiOk({ marks })
      })
    },
    { requireTechnician: true, requiredPermissions: UPDATE_SERVICES }
  )
}
