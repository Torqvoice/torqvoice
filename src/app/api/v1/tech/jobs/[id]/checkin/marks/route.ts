import { logAudit } from '@/lib/audit'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { markInputSchema } from '@/features/condition-map/Lib/marks'
import { createMark } from '@/features/condition-map/Lib/markStore.server'
import { checkinMarkList } from '@/features/condition-map/Lib/checkin.server'
import {
  answeringRefusals,
  appLocale,
  checkinJobFor,
} from '@/features/condition-map/Lib/checkinAccess.server'

/**
 * A mark drawn on the job's condition map from the technician app: where the
 * technician tapped (a panel of a view, as fractions of the view's box), what
 * kind of damage, how bad, and a note. Recorded on the job's drop-off, as the
 * web's Drop-off tab records one, under the same rules.
 *
 * Answers with the job's marks renumbered, so the app shows the numbers the
 * desk and the print show.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params
      const job = await checkinJobFor(ctx, id)
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')
      const body = await request.json().catch(() => null)
      const parsed = markInputSchema.safeParse({
        ...(body && typeof body === 'object' ? body : {}),
        vehicleId: job.vehicleId,
        serviceRecordId: job.id,
        inspectionId: null,
        inspectionItemId: null,
      })
      if (!parsed.success) return apiError(400, 'invalid_request', 'That mark is not complete.')

      return answeringRefusals(async () => {
        const mark = await createMark(ctx.organizationId, ctx.userId, parsed.data)
        await logAudit(ctx, {
          action: 'conditionMark.add',
          entity: 'ConditionMark',
          entityId: mark.id,
          details: { key: 'condition_mark_add', params: { kind: mark.kind, panel: mark.panel } },
          metadata: { vehicleId: mark.vehicleId, serviceRecordId: job.id, via: 'tech-checkin' },
        })
        const marks = await checkinMarkList(
          ctx.organizationId,
          job.vehicleId,
          job.scope,
          await appLocale(request, ctx.organizationId)
        )
        return apiOk({ id: mark.id, marks }, 201)
      })
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      rateLimit: { limit: 60, windowMs: 60_000 },
    }
  )
}
