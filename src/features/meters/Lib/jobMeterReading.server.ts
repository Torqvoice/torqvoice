import 'server-only'

import { db } from '@/lib/db'
import { assertInvoiceEditable } from '@/lib/document-lock.server'
import { jobReadingDate } from '@/features/vehicles/Lib/vehicleReading'
import { activeMeterTypes } from './meters.server'
import { lastMeterValueBefore, parseMeterValue, roundMeterValue } from './meterValue'

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

/**
 * Writes one meter's reading on a job, or takes it away (`null`). The work
 * order page and the technician app both come through here.
 *
 * - The job and the meter have to be this workshop's, and the meter has to
 *   be on the job's vehicle.
 * - A locked invoice refuses the change, as it refuses every other edit to
 *   the job: what it printed is frozen with it.
 * - The reading is dated by the job (when it starts, else its service day),
 *   the date the odometer reading on the same job has.
 * - A reading below the last one before the job is kept and reported, never
 *   refused: meters are misread and replaced.
 */
export async function writeJobMeterReading(input: {
  organizationId: string
  userId: string | null
  jobId: string
  vehicleMeterId: string
  value: string | number | null
  source: 'web' | 'tech'
}): Promise<JobMeterReadingResult> {
  const { organizationId } = input
  const job = await db.serviceRecord.findFirst({
    where: { id: input.jobId, organizationId },
    select: { id: true, vehicleId: true, startDateTime: true, serviceDate: true },
  })
  if (!job || !job.vehicleId) throw new Error('Work order not found')
  const types = await activeMeterTypes(organizationId)
  const meter = await db.vehicleMeter.findFirst({
    where: {
      id: input.vehicleMeterId,
      organizationId,
      vehicleId: job.vehicleId,
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
        },
      },
    },
  })
  if (!meter) throw new Error('Meter not found')
  await assertInvoiceEditable(job.id, organizationId)

  const readAt = jobReadingDate(job)
  const others = meter.readings
    .filter((r) => r.serviceRecordId !== job.id)
    .map((r) => ({
      id: r.id,
      value: r.value.toNumber(),
      readAt: r.readAt,
      createdAt: r.createdAt,
      replacedFrom: r.replacedFrom ? r.replacedFrom.toNumber() : null,
      wrongAt: r.wrongAt,
    }))
  const last = lastMeterValueBefore(others, { readAt })

  const typed = typeof input.value === 'string' ? input.value.trim() : input.value
  if (typed === null || typed === '') {
    await db.meterReading.deleteMany({
      where: { organizationId, vehicleMeterId: meter.id, serviceRecordId: job.id },
    })
    return { vehicleMeterId: meter.id, value: null, last, lower: false }
  }
  const parsed = parseMeterValue(typed)
  if (parsed === null) throw new InvalidMeterReadingError()
  const value = roundMeterValue(parsed)
  await db.meterReading.upsert({
    where: {
      vehicleMeterId_serviceRecordId: { vehicleMeterId: meter.id, serviceRecordId: job.id },
    },
    create: {
      vehicleMeterId: meter.id,
      serviceRecordId: job.id,
      value,
      readAt,
      organizationId,
      createdById: input.userId,
      source: input.source,
    },
    // A reading marked wrong and typed again counts again.
    update: { value, readAt, wrongAt: null, wrongById: null },
  })
  return { vehicleMeterId: meter.id, value, last, lower: last !== null && value < last }
}
