import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { assertInvoiceEditable } from '@/lib/document-lock.server'
import { jobReadingDate } from '@/features/vehicles/Lib/vehicleReading'
import { jobWorkOnItemIds } from '@/features/equipment/Lib/equipmentGate.server'
import { activeMeterTypes } from './meters.server'
import { lastMeterValueBefore, parseMeterValue, roundMeterValue } from './meterValue'
import { READING_JOB_DATES, effectiveReadAt } from './readingTime'

/** What a job's reading came to: what is stored, and the last one before it. */
export interface JobMeterReadingResult {
  vehicleMeterId: string
  value: number | null
  last: number | null
  /** Below the last reading: saved all the same, and said. */
  lower: boolean
}

/**
 * Why a request's readings were refused, all of them, naming the one at
 * fault: `invalid_number` (not a number with up to two decimals),
 * `duplicate` (the same meter twice in one request) or `not_on_job` (not a
 * meter of the job's vehicle or of equipment the job works on, or not this
 * workshop's). The technician API hands both on as they are.
 */
export type MeterReadingRefusal = 'invalid_number' | 'duplicate' | 'not_on_job'

export class InvalidMeterReadingError extends Error {
  constructor(
    readonly vehicleMeterId: string | null = null,
    readonly code: Exclude<MeterReadingRefusal, 'not_on_job'> = 'invalid_number'
  ) {
    super('That is not a reading')
    this.name = 'InvalidMeterReadingError'
  }
}

/** A meter that is not the job's to read. Its message is the one the actions always gave. */
export class MeterNotOnJobError extends Error {
  readonly code = 'not_on_job' as const
  constructor(readonly vehicleMeterId: string) {
    super('Meter not found')
    this.name = 'MeterNotOnJobError'
  }
}

export interface JobMeterReadingInput {
  vehicleMeterId: string
  /** A number, the text typed, or null / empty to take the job's reading away. */
  value: string | number | null
}

/**
 * Writes the readings of a job's meters, or takes them away (`null`). The
 * work order page (one at a time) and the technician app (several at once)
 * both come through here.
 *
 * All of them are checked before any is written, and they are written in one
 * transaction: a request with one bad reading changes nothing.
 *
 * - The job and every meter have to be this workshop's, and each meter has to
 *   be on the job's vehicle now, or on a piece of equipment the job works on.
 *   An item the job works on that moved to another vehicle or was taken off
 *   since still takes readings on this job: the job worked on it, and a
 *   reading misread then is corrected on the job it was read on. An item on
 *   the vehicle that the job does not work on takes none here.
 * - A locked invoice refuses the change, as it refuses every other edit to
 *   the job: what it printed is frozen with it.
 * - A job's reading is dated by the job (`effectiveReadAt`), the date the
 *   odometer reading on the same job has, and follows it when the job moves.
 * - A reading below the last one before the job is kept and reported, never
 *   refused: meters are misread and replaced.
 */
export async function writeJobMeterReadings(input: {
  organizationId: string
  userId: string | null
  jobId: string
  readings: JobMeterReadingInput[]
  source: 'web' | 'tech'
}): Promise<JobMeterReadingResult[]> {
  const { organizationId } = input
  const job = await db.serviceRecord.findFirst({
    where: { id: input.jobId, organizationId },
    select: { id: true, vehicleId: true, startDateTime: true, serviceDate: true },
  })
  if (!job || !job.vehicleId) throw new Error('Work order not found')
  const ids = input.readings.map((r) => r.vehicleMeterId)
  const twice = ids.find((id, i) => ids.indexOf(id) !== i)
  if (twice !== undefined) throw new InvalidMeterReadingError(twice, 'duplicate')

  const [types, itemIds] = await Promise.all([
    activeMeterTypes(organizationId),
    jobWorkOnItemIds(organizationId, { id: job.id, vehicleId: job.vehicleId }),
  ])
  const meters = await db.vehicleMeter.findMany({
    where: {
      id: { in: ids },
      organizationId,
      // The vehicle's own meters, and those of the items the job works on.
      OR: [
        { vehicleId: job.vehicleId },
        ...(itemIds.length > 0 ? [{ equipmentItemId: { in: itemIds } }] : []),
      ],
      removedAt: null,
      meterTypeId: { in: types.map((t) => t.id) },
    },
    select: {
      id: true,
      readings: {
        select: {
          id: true,
          value: true,
          readAt: true,
          createdAt: true,
          replacedFrom: true,
          wrongAt: true,
          serviceRecordId: true,
          serviceRecord: { select: READING_JOB_DATES },
        },
      },
    },
  })

  // Every reading is checked before anything is written.
  const readAt = jobReadingDate(job)
  const plan = input.readings.map((reading) => {
    const meter = meters.find((m) => m.id === reading.vehicleMeterId)
    if (!meter) throw new MeterNotOnJobError(reading.vehicleMeterId)
    const typed = typeof reading.value === 'string' ? reading.value.trim() : reading.value
    let value: number | null = null
    if (typed !== null && typed !== '') {
      const parsed = parseMeterValue(typed)
      if (parsed === null) throw new InvalidMeterReadingError(reading.vehicleMeterId)
      value = roundMeterValue(parsed)
    }
    const others = meter.readings
      .filter((r) => r.serviceRecordId !== job.id)
      .map((r) => ({
        id: r.id,
        value: r.value.toNumber(),
        readAt: effectiveReadAt(r),
        createdAt: r.createdAt,
        replacedFrom: r.replacedFrom ? r.replacedFrom.toNumber() : null,
        wrongAt: r.wrongAt,
      }))
    const last = lastMeterValueBefore(others, { readAt })
    return {
      vehicleMeterId: meter.id,
      value,
      last,
      lower: value !== null && last !== null && value < last,
    }
  })
  await assertInvoiceEditable(job.id, organizationId)

  await db.$transaction(async (tx) => {
    for (const reading of plan) {
      if (reading.value === null) {
        await tx.meterReading.deleteMany({
          where: {
            organizationId,
            vehicleMeterId: reading.vehicleMeterId,
            serviceRecordId: job.id,
          },
        })
        continue
      }
      await tx.meterReading.upsert({
        where: {
          vehicleMeterId_serviceRecordId: {
            vehicleMeterId: reading.vehicleMeterId,
            serviceRecordId: job.id,
          },
        },
        create: {
          vehicleMeterId: reading.vehicleMeterId,
          serviceRecordId: job.id,
          value: reading.value,
          readAt,
          organizationId,
          createdById: input.userId,
          source: input.source,
        },
        // A reading marked wrong and typed again counts again.
        update: { value: reading.value, readAt, wrongAt: null, wrongById: null },
      })
    }
  })
  return plan
}

/** One reading on a job: the work order page's box. */
export async function writeJobMeterReading(
  input: {
    organizationId: string
    userId: string | null
    jobId: string
    source: 'web' | 'tech'
  } & JobMeterReadingInput
): Promise<JobMeterReadingResult> {
  const [result] = await writeJobMeterReadings({
    organizationId: input.organizationId,
    userId: input.userId,
    jobId: input.jobId,
    source: input.source,
    readings: [{ vehicleMeterId: input.vehicleMeterId, value: input.value }],
  })
  return result
}

/** What the unlink helpers need of the job's transaction. */
type UnlinkTx = {
  meterReading: {
    findMany: typeof db.meterReading.findMany
    updateMany: typeof db.meterReading.updateMany
  }
  serviceRecord: { findMany: typeof db.serviceRecord.findMany }
}

/**
 * Lets readings go of the jobs they were taken on. A job's reading is dated by
 * the job as it is now (`effectiveReadAt`), so the stored `readAt` can be the
 * date the job had when the reading was typed, before a reschedule. The date it
 * counts at today is written with the unlink, in the same statement, so the
 * reading stays where it was in the history and the current reading does not
 * change. That is `effectiveReadAt`, not the job's own date: a reading on a
 * job booked into tomorrow counts from when it was typed, and the job's date
 * written here put it back in the future once the job let go of it.
 */
async function unlinkReadingsFromJobs(
  tx: UnlinkTx,
  organizationId: string,
  where: Prisma.MeterReadingWhereInput
): Promise<void> {
  const linked = await tx.meterReading.findMany({
    // AND, not a spread: the caller's `where` names the jobs, and a spread
    // replaced that with "any job", which let one job's change take the
    // readings of every other job with it.
    where: { AND: [where, { organizationId, serviceRecordId: { not: null } }] },
    select: { id: true, serviceRecordId: true, readAt: true, createdAt: true },
  })
  const jobIds = [...new Set(linked.flatMap((r) => (r.serviceRecordId ? [r.serviceRecordId] : [])))]
  if (jobIds.length === 0) return
  const jobs = await tx.serviceRecord.findMany({
    where: { id: { in: jobIds }, organizationId },
    select: { id: true, ...READING_JOB_DATES },
  })
  const now = new Date()
  for (const job of jobs) {
    // The readings of this job by the date each counts at now; usually one.
    const byDate = new Map<number, string[]>()
    for (const reading of linked) {
      if (reading.serviceRecordId !== job.id) continue
      const at = effectiveReadAt({ ...reading, serviceRecord: job }, now).getTime()
      byDate.set(at, [...(byDate.get(at) ?? []), reading.id])
    }
    for (const [at, ids] of byDate) {
      await tx.meterReading.updateMany({
        // Still this job's: one taken off it meanwhile is not dated again.
        where: { ...where, organizationId, serviceRecordId: job.id, id: { in: ids } },
        data: { serviceRecordId: null, readAt: new Date(at) },
      })
    }
  }
}

/**
 * A job that moved to another vehicle in this save: its readings stay in the
 * old vehicle's history (or the old vehicle's equipment's) but are no longer
 * the job's, so nothing prints one vehicle's engine hours under another.
 * Called in the job's own transaction.
 */
export async function unlinkJobMeterReadingsFromOtherVehicles(
  tx: UnlinkTx,
  job: { organizationId: string; jobId: string; vehicleId: string | null }
): Promise<void> {
  await unlinkReadingsFromJobs(tx, job.organizationId, {
    serviceRecordId: job.jobId,
    // Kept: the new vehicle's own meters and those of its equipment.
    ...(job.vehicleId
      ? {
          NOT: {
            OR: [
              { vehicleMeter: { vehicleId: job.vehicleId } },
              { vehicleMeter: { equipmentItem: { vehicleId: job.vehicleId } } },
            ],
          },
        }
      : {}),
  })
}

/**
 * Readings of these items' meters taken on these jobs stop being the job's:
 * the job no longer works on the item. They stay in the item's history. An
 * item that moves or is taken off keeps its readings on the jobs that worked
 * on it; this is only for a job that lets go of the item.
 */
export async function unlinkItemMeterReadings(
  tx: UnlinkTx,
  input: { organizationId: string; itemIds: string[]; jobIds: string[] }
): Promise<void> {
  if (input.itemIds.length === 0 || input.jobIds.length === 0) return
  await unlinkReadingsFromJobs(tx, input.organizationId, {
    vehicleMeter: { equipmentItemId: { in: input.itemIds } },
    serviceRecordId: { in: input.jobIds },
  })
}

/**
 * Jobs about to be deleted: their readings stay in the meters' history at the
 * date they count at now. Called in the delete's transaction, before the
 * delete (the foreign key would otherwise drop the link and leave the date the
 * job had when the reading was typed).
 */
export async function unlinkMeterReadingsOfDeletedJobs(
  tx: UnlinkTx,
  input: {
    organizationId: string
    jobIds: string[]
    /**
     * When the jobs go with their vehicle: the vehicle's own meters and its
     * equipment's go too, so only meters that live on elsewhere are touched
     * (an item moved to another vehicle since).
     */
    vehicleId?: string
  }
): Promise<void> {
  if (input.jobIds.length === 0) return
  await unlinkReadingsFromJobs(tx, input.organizationId, {
    serviceRecordId: { in: input.jobIds },
    ...(input.vehicleId
      ? {
          NOT: {
            OR: [
              { vehicleMeter: { vehicleId: input.vehicleId } },
              { vehicleMeter: { equipmentItem: { vehicleId: input.vehicleId } } },
            ],
          },
        }
      : {}),
  })
}
