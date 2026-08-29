import { mkdir, stat, writeFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import { db } from '@/lib/db'
import { getFeatures, type PlanFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'

/**
 * Attaches a photo or video shot in the bay to a job.
 *
 * One request, not the web's two. The browser uploads a file, gets a URL back
 * and then posts that URL as an attachment, which is fine on a desk and wrong
 * on a phone: a technician on workshop wifi who loses signal between the two
 * calls leaves a file on disk that no job points at, and has no way to know.
 * Here the row and the bytes commit together or neither does.
 */

/**
 * Deliberately narrower than the web's list. This endpoint exists for a camera,
 * so it accepts what a camera produces. PDFs, spreadsheets and text files have
 * no business arriving from a phone in a bay, and every format accepted is a
 * parser somewhere that has to be right.
 */
const ALLOWED = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/heic', 'heic'],
  ['video/mp4', 'mp4'],
  ['video/quicktime', 'mov'],
])

/**
 * Smaller than the web's 500MB. A phone on shop wifi uploading half a gigabyte
 * is a request that will not finish, and a limit that cannot be met in the
 * field is not a limit, it is a timeout with extra steps.
 */
const MAX_BYTES = 60 * 1024 * 1024

const CATEGORY_LIMIT: Record<string, keyof PlanFeatures | undefined> = {
  image: 'maxImagesPerService',
  diagnostic: 'maxDiagnosticsPerService',
  document: 'maxDocumentsPerService',
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
        select: { id: true },
      })
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')

      const form = await request.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        return apiError(400, 'invalid_request', 'No file was attached.')
      }

      const ext = ALLOWED.get(file.type)
      if (!ext) {
        return apiError(400, 'invalid_request', 'That file type cannot be attached from the app.')
      }
      if (file.size === 0) {
        return apiError(400, 'invalid_request', 'That file is empty.')
      }
      if (file.size > MAX_BYTES) {
        return apiError(400, 'invalid_request', 'That file is too large. Keep it under 60 MB.')
      }

      const category = file.type.startsWith('video/') ? 'video' : 'image'
      const description = (form.get('description') as string | null)?.slice(0, 500) || undefined

      const limitKey = CATEGORY_LIMIT[category]
      if (limitKey) {
        const features = await getFeatures(ctx.organizationId)
        const max = features[limitKey] as number
        const used = await db.serviceAttachment.count({
          where: { serviceRecordId: job.id, category },
        })
        if (used >= max) {
          return apiError(
            409,
            'conflict',
            `This job already has the maximum of ${max} ${category === 'video' ? 'videos' : 'photos'}.`
          )
        }
      }

      // The filename is generated, never taken from the client. A name that
      // arrives over the wire is an attacker-controlled path, and the only
      // safe thing to do with one is not use it.
      const filename = `${crypto.randomUUID()}.${ext}`
      const dir = path.join(process.cwd(), 'data', 'uploads', ctx.organizationId, 'services')
      await mkdir(dir, { recursive: true })
      const target = path.join(dir, filename)

      await writeFile(target, new Uint8Array(await file.arrayBuffer()))
      const written = await stat(target)

      const attachment = await db.serviceAttachment.create({
        data: {
          // The original name is kept as a label only, and is never part of a
          // path. Trimmed because a phone can produce a very long one.
          fileName: (file.name || filename).slice(0, 200),
          fileUrl: `/api/protected/files/${ctx.organizationId}/services/${filename}`,
          fileType: file.type,
          fileSize: written.size,
          category,
          description,
          serviceRecordId: job.id,
        },
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          fileType: true,
          fileSize: true,
          category: true,
          createdAt: true,
        },
      })

      return apiOk({ attachment }, 201)
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      // Uploads are slower and heavier than reads, and a runaway retry loop
      // here fills a disk rather than just burning CPU.
      rateLimit: { limit: 30, windowMs: 60_000 },
    }
  )
}
