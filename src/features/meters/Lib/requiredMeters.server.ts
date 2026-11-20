import 'server-only'

import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { getInvoiceLockState } from '@/lib/document-lock.server'
import { shouldIssue } from '@/features/invoices/Lib/issuedInvoice'
import { jobReadingDate } from '@/features/vehicles/Lib/vehicleReading'
import { itemsOnVehicle } from '@/features/equipment/Lib/equipmentGate.server'
import { type JobMeterView, jobMeterViews } from './meters.server'

/**
 * Meters a workshop has marked "Required on work orders", asked for before a
 * job is finished with.
 *
 * A job is not completed, and its invoice is not sent or shared by link,
 * while a required meter that applies to it has no reading on it. Every path
 * that completes a job or sends its invoice asks here first, before it
 * writes or sends anything, and is refused with the meters named. Nothing
 * else is ever stopped: an ordinary save, a new or booked job, any status
 * before completed, a quote, and never money: a payment, or marking the
 * invoice paid, is recorded and issues the invoice as it always has, as for
 * the customer's Reference / PO.
 *
 * Which meters apply is what the work order shows (`jobMeterViews`): the
 * vehicle's own meters in use, and the meters of the pieces of equipment the
 * job works on ("Work on"), never those of an item it does not. A hidden
 * meter is never asked for, nor anything on a job without a vehicle. A
 * reading counts when the job has one of its own, the one its box shows; an
 * older reading on the vehicle does not.
 *
 * Left alone, so nothing turns against work already done:
 * - a job completed already: it was completed before the meter was required,
 *   or with its readings; reprints, payments and edits go on as before;
 * - a send that issues nothing (the invoice is out already and a re-send
 *   only follows it);
 * - an invoice locked by the workshop's lock rule, on which no reading can be
 *   typed any more: asking for one there could never be answered.
 */

/** Why a job is being finished with, which is what the refusal says. */
export type RequiredMetersOccasion = 'complete' | 'send' | 'share'

/** The message on each occasion, in `vehicles.meters`. */
const MESSAGE_KEY: Record<RequiredMetersOccasion, string> = {
  complete: 'requiredNotCompleted',
  send: 'requiredNotSent',
  share: 'requiredNotShared',
}

/** A required meter the job has no reading of. */
export interface MissingRequiredMeter {
  vehicleMeterId: string
  meterTypeId: string
  name: string
  /** The piece of equipment it is on, for an item the job works on. */
  item: { id: string; label: string } | null
}

/** Refused for the meters named; the message names them too. */
export class RequiredMetersRefusedError extends Error {
  constructor(
    message: string,
    readonly meters: MissingRequiredMeter[]
  ) {
    super(message)
    this.name = 'RequiredMetersRefusedError'
  }
}

/** Whether the workshop asks for any meter at all: one small query, and nothing more when not. */
async function asksForAnyMeter(organizationId: string): Promise<boolean> {
  const row = await db.meterType.findFirst({
    where: { organizationId, required: true, isActive: true },
    select: { id: true },
  })
  return Boolean(row)
}

function missingOf(meters: JobMeterView[]): MissingRequiredMeter[] {
  return meters
    .filter((meter) => meter.required && meter.value == null)
    .map((meter) => ({
      vehicleMeterId: meter.vehicleMeterId,
      meterTypeId: meter.meterTypeId,
      name: meter.name,
      item: meter.item ?? null,
    }))
}

/**
 * The required meters this job has no reading of, on this occasion; empty
 * when nothing is asked. `vehicleId` is the vehicle the job is on once the
 * save asking is through, when that save moves it: the new vehicle's meters
 * then apply, with the equipment the job keeps working on (the items on the
 * new vehicle; the save lets go of the rest).
 */
export async function missingRequiredMeters(
  organizationId: string,
  jobId: string,
  occasion: RequiredMetersOccasion,
  options: { vehicleId?: string | null } = {}
): Promise<MissingRequiredMeter[]> {
  if (!(await asksForAnyMeter(organizationId))) return []
  const job = await db.serviceRecord.findFirst({
    where: { id: jobId, organizationId },
    select: {
      id: true,
      status: true,
      vehicleId: true,
      startDateTime: true,
      serviceDate: true,
      issuedAt: true,
      editUnlockedAt: true,
    },
  })
  if (!job || job.status === 'completed') return []
  const vehicleId = options.vehicleId !== undefined ? options.vehicleId : job.vehicleId
  if (!vehicleId) return []
  // Sending and sharing issue the invoice the way any send does.
  if (occasion !== 'complete' && !shouldIssue(job, 'sent')) return []

  let meters = await jobMeterViews(organizationId, {
    id: job.id,
    vehicleId,
    readAt: jobReadingDate(job),
  })
  if (vehicleId !== job.vehicleId) {
    // Moving vehicles in the same save: only the items on the new vehicle stay worked on.
    const staying = await itemsOnVehicle(
      organizationId,
      meters.flatMap((meter) => (meter.item ? [meter.item.id] : [])),
      vehicleId
    )
    meters = meters.filter((meter) => !meter.item || staying.has(meter.item.id))
  }
  const missing = missingOf(meters)
  if (missing.length === 0) return []
  // A locked invoice takes no reading; it was locked on what it said then.
  if ((await getInvoiceLockState(job.id, organizationId)).locked) return []
  return missing
}

/**
 * The required meters of a vehicle, for a job made already completed: it has
 * no reading of its own yet, so each of them is missing. Equipment is not
 * asked, since a job being made works on none yet.
 */
export async function missingRequiredMetersForNewJob(
  organizationId: string,
  vehicleId: string | null
): Promise<MissingRequiredMeter[]> {
  if (!vehicleId || !(await asksForAnyMeter(organizationId))) return []
  // An id no job has: none of the vehicle's readings are this job's.
  const meters = await jobMeterViews(organizationId, {
    id: '',
    vehicleId,
    readAt: new Date(),
  })
  return missingOf(meters.filter((meter) => !meter.item))
}

/**
 * The meters as a sentence names them: by name, with the item for a meter
 * whose name another missing meter shares ("Crane hours (HIAB X-HiPro)").
 */
export function requiredMeterNames(meters: MissingRequiredMeter[]): string {
  const seen = new Map<string, number>()
  for (const meter of meters) seen.set(meter.name, (seen.get(meter.name) ?? 0) + 1)
  return meters
    .map((meter) =>
      meter.item && (seen.get(meter.name) ?? 0) > 1
        ? `${meter.name} (${meter.item.label})`
        : meter.name
    )
    .join(', ')
}

/**
 * The refusal for these meters on this occasion, in the language of whoever
 * asked (the person signed in, or the phone's for the technician app).
 */
export async function requiredMetersRefusal(
  occasion: RequiredMetersOccasion,
  meters: MissingRequiredMeter[]
): Promise<RequiredMetersRefusedError> {
  const t = await getTranslations('vehicles.meters')
  return new RequiredMetersRefusedError(
    t(MESSAGE_KEY[occasion] as 'requiredNotCompleted', { meters: requiredMeterNames(meters) }),
    meters
  )
}

/**
 * Refuses the occasion while a required meter has no reading on the job.
 * Called first, before anything is written, issued or delivered.
 */
export async function assertRequiredMetersRead(
  organizationId: string,
  jobId: string,
  occasion: RequiredMetersOccasion,
  options: { vehicleId?: string | null } = {}
): Promise<void> {
  const missing = await missingRequiredMeters(organizationId, jobId, occasion, options)
  if (missing.length > 0) throw await requiredMetersRefusal(occasion, missing)
}
