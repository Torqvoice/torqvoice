import 'server-only'

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

export class InvalidMeterReadingError extends Error {
  constructor() {
    super('That is not a reading')
    this.name = 'InvalidMeterReadingError'
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
  if (new Set(ids).size !== ids.length) throw new InvalidMeterReadingError()

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
    if (!meter) throw new Error('Meter not found')
    const typed = typeof reading.value === 'string' ? reading.value.trim() : reading.value
    let value: number | null = null
    if (typed !== null && typed !== '') {
      const parsed = parseMeterValue(typed)
      if (parsed === null) throw new InvalidMeterReadingError()
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

/**
 * A job that moved to another vehicle in this save: its readings stay in the
 * old vehicle's history (or the old vehicle's equipment's) but are no longer
 * the job's, so nothing prints one vehicle's engine hours under another.
 * Called in the job's own transaction.
 */
export async function unlinkJobMeterReadingsFromOtherVehicles(
  tx: { meterReading: { updateMany: typeof db.meterReading.updateMany } },
  job: { organizationId: string; jobId: string; vehicleId: string | null }
): Promise<void> {
  await tx.meterReading.updateMany({
    where: {
      organizationId: job.organizationId,
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
    },
    data: { serviceRecordId: null },
  })
}

/**
 * Readings of these items' meters taken on these jobs stop being the job's:
 * the job no longer works on the item. They stay in the item's history. An
 * item that moves or is taken off keeps its readings on the jobs that worked
 * on it; this is only for a job that lets go of the item.
 */
export async function unlinkItemMeterReadings(
  tx: { meterReading: { updateMany: typeof db.meterReading.updateMany } },
  input: { organizationId: string; itemIds: string[]; jobIds: string[] }
): Promise<void> {
  if (input.itemIds.length === 0 || input.jobIds.length === 0) return
  await tx.meterReading.updateMany({
    where: {
      organizationId: input.organizationId,
      vehicleMeter: { equipmentItemId: { in: input.itemIds } },
      serviceRecordId: { in: input.jobIds },
    },
    data: { serviceRecordId: null },
  })
}
