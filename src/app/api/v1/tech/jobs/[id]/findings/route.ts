import { z } from 'zod'
import { resolveDocumentLocale } from '@/i18n/locale-from-request'
import { db } from '@/lib/db'
import { FAULT_STATUSES, faultLine, normalizeFaultCode } from '@/features/fault-codes/Lib/codes'
import { lookupMeanings, vehicleForCodes } from '@/features/fault-codes/Lib/service.server'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { jobScopeFor } from '@/features/workboard/Lib/jobTeam'

/**
 * Records something the technician noticed that is not part of this job.
 *
 * A worn belt spotted while doing a clutch is the most perishable information
 * in a workshop: it is known for about ten seconds, by one person, with their
 * hands full. Anything that makes recording it slower than forgetting it means
 * it gets forgotten, which is why this takes a sentence and nothing else.
 *
 * The finding hangs off the vehicle, not the job, because it outlives the job.
 * `serviceRecordId` records where it was spotted so the history reads properly
 * later.
 */
const bodySchema = z
  .object({
    description: z.string().trim().max(1000).optional(),
    severity: z.enum(['monitor', 'needs_work', 'urgent']).default('needs_work'),
    notes: z.string().max(2000).optional(),
    /**
     * A fault code read off a scan tool, such as P0420. The app saves its
     * meaning with it when the code service answers; the description can
     * then be left out and reads "P0420 <meaning>".
     */
    faultCode: z.string().max(16).optional(),
    faultStatus: z.enum(FAULT_STATUSES).optional(),
    faultModule: z.string().trim().max(80).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.faultCode !== undefined && !normalizeFaultCode(body.faultCode)) {
      ctx.addIssue({ code: 'custom', path: ['faultCode'], message: 'Not a fault code' })
    }
    if (!body.description && !body.faultCode) {
      ctx.addIssue({ code: 'custom', path: ['description'], message: 'Required' })
    }
  })

/** What the app gets back about a finding, code fields included. */
const FINDING_SELECT = {
  id: true,
  description: true,
  severity: true,
  status: true,
  notes: true,
  faultCode: true,
  faultStatus: true,
  faultModule: true,
  faultMeaning: true,
  faultMeaningSource: true,
  createdAt: true,
} as const

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params
      const body = bodySchema.parse(await request.json())

      const job = await db.serviceRecord.findFirst({
        where: {
          id,
          organizationId: ctx.organizationId,
          ...jobScopeFor(ctx),
        },
        select: { id: true, vehicleId: true },
      })
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')

      // A counter sale has no vehicle, and a finding with nothing to hang off
      // would be an orphan nobody ever sees again.
      if (!job.vehicleId) {
        return apiError(
          409,
          'conflict',
          'This job has no vehicle to record an observation against.'
        )
      }

      // A code gets its meaning saved with it, as one added in the browser
      // does. The service not answering costs the meaning, never the code.
      const faultCode = normalizeFaultCode(body.faultCode)
      let meaning: { title: string; source: string | null } | null = null
      if (faultCode) {
        const [vehicle, locale] = await Promise.all([
          vehicleForCodes(ctx.organizationId, job.vehicleId),
          resolveDocumentLocale(ctx.organizationId),
        ])
        const { results } = await lookupMeanings(ctx.organizationId, [faultCode], vehicle, locale)
        const view = results[0]
        if (view?.state === 'found' && view.title) {
          meaning = { title: view.title, source: view.source }
        }
      }

      const finding = await db.vehicleFinding.create({
        data: {
          description: body.description || faultLine(faultCode ?? '', meaning?.title),
          severity: body.severity,
          notes: body.notes,
          vehicleId: job.vehicleId,
          serviceRecordId: job.id,
          ...(faultCode
            ? {
                faultCode,
                faultStatus: body.faultStatus ?? null,
                faultModule: body.faultModule || null,
                faultMeaning: meaning?.title ?? null,
                faultMeaningSource: meaning?.source ?? null,
              }
            : {}),
        },
        select: FINDING_SELECT,
      })

      return apiOk({ finding }, 201)
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
