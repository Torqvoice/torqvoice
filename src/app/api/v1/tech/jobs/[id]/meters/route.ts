import { z } from 'zod'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { checkinJobFor } from '@/features/condition-map/Lib/checkinAccess.server'
import { jobMeterViews, metersEnabled } from '@/features/meters/Lib/meters.server'
import { writeJobMeterReadings } from '@/features/meters/Lib/jobMeterReading.server'
import { jobReadingDate } from '@/features/vehicles/Lib/vehicleReading'

/**
 * A job's readings of its vehicle's meters besides the odometer (engine
 * hours, PTO hours), for the technician app. Named `vehicle-meters` in
 * `src/lib/tech-api-features.ts`.
 *
 * GET answers `{ meters }`: per meter its name, unit, this job's reading
 * (null when none), the last reading before the job (null when none) and
 * `item`: null for the vehicle's own meter, else `{ id, label }` of the piece
 * of equipment it is on, one the job works on (`vehicle-equipment`).
 * PUT takes `{ readings: [{ vehicleMeterId, value }] }`, an item's meter as
 * well as the vehicle's, `value` a number or
 * null to take the job's reading away, and answers each one with whether it
 * is below the last reading: kept all the same, as on the web.
 */

async function readingDateOf(organizationId: string, jobId: string): Promise<Date | null> {
  const job = await db.serviceRecord.findFirst({
    where: { id: jobId, organizationId },
    select: { startDateTime: true, serviceDate: true },
  })
  return job ? jobReadingDate(job) : null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params
      const job = await checkinJobFor(ctx, id)
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')
      const readAt = await readingDateOf(ctx.organizationId, job.id)
      const meters = readAt
        ? await jobMeterViews(ctx.organizationId, { id: job.id, vehicleId: job.vehicleId, readAt })
        : []
      return apiOk({ meters })
    },
    {
      requireTechnician: true,
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}

const putSchema = z.object({
  readings: z
    .array(
      z.object({
        vehicleMeterId: z.string().min(1),
        value: z.union([z.number().min(0), z.string().max(32)]).nullable(),
      })
    )
    .min(1)
    .max(50),
})

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params
      const job = await checkinJobFor(ctx, id)
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')
      if (!(await metersEnabled(ctx.organizationId))) {
        return apiError(404, 'not_found', 'This workshop does not record meters.')
      }
      const parsed = putSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) {
        return apiError(400, 'invalid_request', 'Send readings: [{ vehicleMeterId, value }].')
      }
      // Every reading is checked first and all are written in one
      // transaction: one bad reading in the request changes nothing.
      let results
      try {
        results = await writeJobMeterReadings({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          jobId: job.id,
          readings: parsed.data.readings,
          source: 'tech',
        })
      } catch (error) {
        const name = error instanceof Error ? error.name : ''
        if (name === 'DocumentLockedError') {
          return apiError(409, 'document_locked', (error as Error).message)
        }
        if (name === 'InvalidMeterReadingError') {
          return apiError(
            400,
            'invalid_request',
            'A reading is a number with up to two decimals, each meter once.'
          )
        }
        if (error instanceof Error && error.message === 'Meter not found') {
          return apiError(
            404,
            'not_found',
            'That meter is not on this job’s vehicle or the equipment it works on.'
          )
        }
        throw error
      }
      await logAudit(ctx, {
        action: 'service.update',
        entity: 'ServiceRecord',
        entityId: job.id,
        details: { key: 'service_update', params: { ref: job.ref } },
        metadata: { serviceRecordId: job.id, via: 'tech-meters', readings: results.length },
      })
      return apiOk({ readings: results })
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
