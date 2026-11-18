import 'server-only'
import type { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { publishRecordChange } from '@/lib/realtime/publish.server'
import { statusColumns } from '@/features/work-order-statuses/Lib/stages'
import { announceJobStatusChanged } from '@/features/vehicles/Lib/jobEvents'
import { type ApiAuthContext, apiError } from '@/lib/with-api-auth'
import { getBestLocaleFromHeader, resolveDocumentLocale } from '@/i18n/locale-from-request'
import { type MarkScope } from './marks'
import { jobScope } from './checkin.server'
import { jobScopeFor } from '@/features/workboard/Lib/jobTeam'

/**
 * The job a technician app request is about, when it is theirs to check in:
 * this workshop's, assigned to one of their technician rows (an owner or an
 * admin may check in any job), and with a vehicle to draw. Null otherwise,
 * so the route answers "not on your list" rather than saying which.
 */
export async function checkinJobFor(
  ctx: ApiAuthContext,
  id: string
): Promise<{
  id: string
  vehicleId: string
  status: string
  /** How the job is named in its history: its number, else its id. */
  ref: string
  scope: MarkScope
} | null> {
  const job = await db.serviceRecord.findFirst({
    where: {
      id,
      organizationId: ctx.organizationId,
      ...jobScopeFor(ctx),
    },
    select: {
      id: true,
      vehicleId: true,
      status: true,
      inspectionId: true,
      createdAt: true,
      invoiceNumber: true,
    },
  })
  if (!job?.vehicleId) return null
  return {
    id: job.id,
    vehicleId: job.vehicleId,
    status: job.status,
    ref: job.invoiceNumber || job.id,
    scope: jobScope(job),
  }
}

/**
 * The language the app reads in: its own setting, sent as Accept-Language,
 * else the workshop's. Panel and kind names come back in it.
 */
export async function appLocale(request: Request, organizationId: string): Promise<string> {
  return (
    getBestLocaleFromHeader(request.headers.get('accept-language')) ??
    (await resolveDocumentLocale(organizationId))
  )
}

/**
 * The refusals the mark store raises, as answers the app can show: a sheet
 * that is closed, a kind the workshop does not have, a mark gone meanwhile.
 * Anything else is a fault and goes to withApiAuth's handler.
 */
const KNOWN_REFUSALS: Record<
  string,
  { status: number; code: 'not_found' | 'conflict' | 'invalid_request' }
> = {
  'Mark not found': { status: 404, code: 'not_found' },
  'Work order not found': { status: 404, code: 'not_found' },
  'Unknown kind of mark': { status: 400, code: 'invalid_request' },
  'A file in this request is not an upload of this workshop': {
    status: 400,
    code: 'invalid_request',
  },
}

export async function answeringRefusals(run: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await run()
  } catch (err) {
    const known = err instanceof Error ? KNOWN_REFUSALS[err.message] : undefined
    if (known && err instanceof Error) return apiError(known.status, known.code, err.message)
    throw err
  }
}

/** Whether a mark was drawn on this job, and so is the app's to change. */
export async function editableMark(
  organizationId: string,
  job: { id: string; vehicleId: string },
  markId: string
) {
  return db.conditionMark.findFirst({
    where: { id: markId, organizationId, vehicleId: job.vehicleId, serviceRecordId: job.id },
    select: { id: true, imageUrls: true },
  })
}

/**
 * A booking whose car is being checked in has arrived. Its first check-in
 * write moves it from `scheduled` to `pending`, before the write itself:
 * until then an online booking is a placeholder the customer's cancel link
 * deletes with everything on it, and a car standing in the yard with its
 * photos taken is no longer that.
 */
export async function noteArrival(organizationId: string, job: { id: string; status: string }) {
  if (job.status !== 'scheduled') return
  const moved = await db.serviceRecord.updateMany({
    where: { id: job.id, organizationId, status: 'scheduled' },
    data: statusColumns('pending'),
  })
  if (moved.count > 0) {
    job.status = 'pending'
    announceJobStatusChanged({ organizationId, serviceRecordId: job.id, status: 'pending' })
  }
}

/**
 * Tells a work order page open on this job that its marks changed, for a
 * write the mark itself does not name the job in: clearing an earlier
 * visit's mark touches that visit's row, not this one.
 */
export function announceMarksChanged(organizationId: string, jobId: string) {
  publishRecordChange({ kind: 'serviceRecord', id: jobId, organizationId, hint: 'conditionMarks' })
}
