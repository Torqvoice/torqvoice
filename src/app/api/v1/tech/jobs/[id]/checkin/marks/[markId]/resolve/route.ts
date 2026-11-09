import { z } from 'zod'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { splitMarks } from '@/features/condition-map/Lib/marks'
import { loadVehicleConditionMarks } from '@/features/condition-map/Lib/loadMarks.server'
import { setMarkResolvedIfUnchanged } from '@/features/condition-map/Lib/markStore.server'
import { checkinMarkList } from '@/features/condition-map/Lib/checkin.server'
import {
  answeringRefusals,
  announceMarksChanged,
  appLocale,
  checkinJobFor,
  noteArrival,
} from '@/features/condition-map/Lib/checkinAccess.server'

/**
 * A mark from an earlier visit that the technician walking round the car
 * finds gone: repaired, or never there. It stays as that visit's history and
 * stops showing as current. `{ resolved: false }` takes it back, for the undo
 * straight after.
 *
 * On the web this is the vehicle's right. Here it is part of checking in a
 * job the technician is on, so the job's right covers it, for marks on that
 * job's own vehicle only.
 */
const bodySchema = z.object({ resolved: z.boolean() })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; markId: string }> }
) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id, markId } = await params
      const job = await checkinJobFor(ctx, id)
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')
      const parsed = bodySchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) return apiError(400, 'invalid_request', 'Say whether it is resolved.')
      const { resolved } = parsed.data

      const all = await loadVehicleConditionMarks(ctx.organizationId, job.vehicleId)
      const mark = all.find((m) => m.id === markId)
      if (!mark) return apiError(404, 'not_found', 'That mark is not on this vehicle.')
      if (mark.serviceRecordId === job.id) {
        return apiError(400, 'invalid_request', 'A mark of this check-in is removed, not cleared.')
      }
      if (resolved) {
        const { previous } = splitMarks(all, job.scope)
        if (!previous.some((m) => m.id === markId)) {
          return apiError(409, 'conflict', 'That mark is already closed.')
        }
      } else {
        if (!mark.resolvedAt || mark.carriedToId) {
          return apiError(409, 'conflict', 'That mark is not cleared.')
        }
        // Only a mark this check-in could have cleared: one that, open again,
        // would be an earlier visit's mark on this job's map. A later visit's
        // or the linked inspection's is not this job's to reopen.
        const reopened = all.map((m) => (m.id === markId ? { ...m, resolvedAt: null } : m))
        if (!splitMarks(reopened, job.scope).previous.some((m) => m.id === markId)) {
          return apiError(409, 'conflict', "That mark is not this check-in's to reopen.")
        }
      }

      return answeringRefusals(async () => {
        // Written only in the state it was checked in: the desk may have
        // confirmed or cleared the same mark a moment ago.
        const changed = await setMarkResolvedIfUnchanged(
          ctx.organizationId,
          ctx.userId,
          markId,
          resolved
        )
        if (!changed) {
          return apiError(409, 'conflict', 'That mark was changed meanwhile. Pull to refresh.')
        }
        await noteArrival(ctx.organizationId, job)
        // The write names the earlier visit's job; this one's page is told too.
        announceMarksChanged(ctx.organizationId, job.id)
        const marks = await checkinMarkList(
          ctx.organizationId,
          job.vehicleId,
          job.scope,
          await appLocale(request, ctx.organizationId)
        )
        return apiOk({ marks })
      })
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
