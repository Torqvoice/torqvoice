import { randomBytes } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'

/**
 * A short update for the customer, recorded standing at the car.
 *
 * This is the feature a workshop sells on: a sixty-second video of the actual
 * worn part beats any amount of written explanation, and the only moment it
 * can be filmed is while the technician is looking at it. So the video and the
 * report are one request, for the same reason attachments are.
 *
 * Text-only is allowed and stays a draft, matching the web: a report with
 * nothing to show is something the office finishes, not something a customer
 * should receive as-is.
 *
 * This endpoint creates the report. It never sends it. Choosing to message a
 * customer, over which channel, is an outward-facing decision that belongs
 * with whoever owns the customer relationship, and a technician's phone in a
 * noisy bay is the wrong place to make it irreversible.
 */

const ALLOWED_VIDEO = new Map<string, string>([
  ['video/mp4', 'mp4'],
  ['video/quicktime', 'mov'],
])

/** Roughly two minutes of phone video. Longer than that is not a status update. */
const MAX_BYTES = 120 * 1024 * 1024

/** Matches the web's default: a link that outlives the repair by a fortnight. */
const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000

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
        select: { id: true, technicianId: true },
      })
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')

      const form = await request.formData()
      const title = (form.get('title') as string | null)?.slice(0, 200) || undefined
      const message = (form.get('message') as string | null)?.slice(0, 4000) || undefined
      const video = form.get('video')

      let videoUrl: string | undefined
      let videoFileName: string | undefined

      if (video instanceof File && video.size > 0) {
        const ext = ALLOWED_VIDEO.get(video.type)
        if (!ext) {
          return apiError(400, 'invalid_request', 'That video format cannot be uploaded.')
        }
        if (video.size > MAX_BYTES) {
          return apiError(
            400,
            'invalid_request',
            'That video is too long. Keep it under two minutes.'
          )
        }

        // Generated name, never the client's. See the attachments route.
        const filename = `${crypto.randomUUID()}.${ext}`
        const dir = path.join(process.cwd(), 'data', 'uploads', ctx.organizationId, 'services')
        await mkdir(dir, { recursive: true })
        const target = path.join(dir, filename)
        await writeFile(target, new Uint8Array(await video.arrayBuffer()))
        await stat(target)

        videoUrl = `/api/protected/files/${ctx.organizationId}/services/${filename}`
        videoFileName = (video.name || filename).slice(0, 200)
      }

      if (!title && !message && !videoUrl) {
        return apiError(400, 'invalid_request', 'Add a message or a video before sending.')
      }

      const report = await db.statusReport.create({
        data: {
          // 32 bytes of CSPRNG output. This token is the only thing standing
          // between a public URL and a customer's repair details.
          publicToken: randomBytes(32).toString('hex'),
          title,
          message,
          videoUrl,
          videoFileName,
          serviceRecordId: job.id,
          organizationId: ctx.organizationId,
          technicianId: ctx.technicianIds[0] ?? job.technicianId,
          status: videoUrl ? 'published' : 'draft',
          expiresAt: new Date(Date.now() + DEFAULT_TTL_MS),
        },
        select: {
          id: true,
          title: true,
          message: true,
          videoUrl: true,
          status: true,
          createdAt: true,
        },
      })

      return apiOk({ report }, 201)
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      rateLimit: { limit: 20, windowMs: 60_000 },
    }
  )
}
