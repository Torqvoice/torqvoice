import { z } from 'zod'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { BODY_TYPES } from '@/features/condition-map/Lib/drawingTypes'
import { loadCheckin } from '@/features/condition-map/Lib/checkin.server'
import {
  appLocale,
  checkinJobFor,
  noteArrival,
} from '@/features/condition-map/Lib/checkinAccess.server'

/**
 * A job's check-in, for the technician walking round the car as it arrives:
 * the mileage, the drop-off photos by position and the condition map. The
 * same records the web's Drop-off tab shows, so the desk sees the walk as it
 * happens and it prints the same way.
 *
 * `?body=` draws another body type for a look before choosing it; the
 * vehicle keeps its own until a PATCH says otherwise.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params
      const job = await checkinJobFor(ctx, id)
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')
      const body = new URL(request.url).searchParams.get('body')
      const checkin = await loadCheckin(
        ctx.organizationId,
        job.id,
        await appLocale(request, ctx.organizationId),
        { body }
      )
      if (!checkin) return apiError(404, 'not_found', 'That job has no vehicle to check in.')
      return apiOk(checkin)
    },
    {
      requireTechnician: true,
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}

const patchSchema = z
  .object({
    /** On the dashboard as the car arrived; null clears a wrong one. */
    mileage: z.number().int().min(0).max(10_000_000).nullable().optional(),
    /** The drawing the vehicle is marked on. */
    bodyType: z.enum(BODY_TYPES).optional(),
  })
  .refine((v) => v.mileage !== undefined || v.bodyType !== undefined, 'Nothing to change')

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params
      const job = await checkinJobFor(ctx, id)
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')
      const parsed = patchSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) return apiError(400, 'invalid_request', 'Send a mileage or a body type.')
      const { mileage, bodyType } = parsed.data
      await noteArrival(ctx.organizationId, job)

      if (mileage !== undefined) {
        await db.serviceRecord.update({ where: { id: job.id }, data: { mileage } })
        // The vehicle's reading only ever goes up, as it does when the job is
        // saved on the web: a typo on an old job must not wind the clock back.
        if (mileage !== null) {
          await db.vehicle.updateMany({
            where: {
              id: job.vehicleId,
              organizationId: ctx.organizationId,
              mileage: { lt: mileage },
            },
            data: { mileage },
          })
        }
      }
      if (bodyType) {
        await db.vehicle.updateMany({
          where: { id: job.vehicleId, organizationId: ctx.organizationId },
          data: { bodyType },
        })
      }

      await logAudit(ctx, {
        action: 'service.update',
        entity: 'ServiceRecord',
        entityId: job.id,
        details: { key: 'service_update', params: { ref: job.ref } },
        metadata: { serviceRecordId: job.id, via: 'tech-checkin', mileage, bodyType },
      })
      return apiOk({ mileage: mileage ?? undefined, bodyType: bodyType ?? undefined })
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
