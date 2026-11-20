import 'server-only'

import { READING_JOB_DATES, effectiveReadAt } from './readingTime'
import { db } from '@/lib/db'
import { equipmentLabels, jobWorkOnItemIds } from '@/features/equipment/Lib/equipmentGate.server'
import { getFeatures } from '@/lib/features'
import {
  type MeterReadingLike,
  byReadingTime,
  lastMeterValueBefore,
  meterState,
} from './meterValue'

/** One of the workshop's meters, as forms and documents name it. */
export interface MeterTypeView {
  id: string
  name: string
  unit: string
}

/**
 * The workshop's meters in use, in their order. Empty for a workshop that
 * has defined none, and for one whose plan has no custom fields: then nothing
 * about meters shows anywhere, and their readings are kept. The plan is asked
 * first, so a workshop without it costs no query on meters at all.
 */
export async function activeMeterTypes(organizationId: string): Promise<MeterTypeView[]> {
  if (!(await getFeatures(organizationId)).customFields) return []
  return db.meterType.findMany({
    where: { organizationId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, unit: true },
  })
}

/** Whether meters show at all for this workshop. */
export async function metersEnabled(organizationId: string): Promise<boolean> {
  return (await activeMeterTypes(organizationId)).length > 0
}

const READING_SELECT = {
  id: true,
  value: true,
  readAt: true,
  createdAt: true,
  replacedFrom: true,
  wrongAt: true,
  source: true,
  serviceRecordId: true,
  serviceRecord: {
    select: {
      id: true,
      title: true,
      invoiceNumber: true,
      vehicleId: true,
      ...READING_JOB_DATES,
    },
  },
} as const

type ReadingRow = {
  id: string
  value: { toNumber(): number }
  readAt: Date
  createdAt: Date
  replacedFrom: { toNumber(): number } | null
  wrongAt: Date | null
  source: string
  serviceRecordId: string | null
  serviceRecord: {
    id: string
    title: string
    invoiceNumber: string | null
    vehicleId: string | null
    startDateTime: Date | null
    serviceDate: Date
  } | null
}

function asLike(row: ReadingRow): MeterReadingLike {
  return {
    id: row.id,
    value: row.value.toNumber(),
    // A job's reading is dated by the job as it is now.
    readAt: effectiveReadAt(row),
    createdAt: row.createdAt,
    replacedFrom: row.replacedFrom ? row.replacedFrom.toNumber() : null,
    wrongAt: row.wrongAt,
    serviceRecordId: row.serviceRecordId,
  }
}

/** A reading as a page shows it in the meter's history. */
export interface MeterReadingView {
  id: string
  value: number
  /** When it counts as taken: a job's reading follows the job's date. */
  readAt: string
  /** When it was typed, which orders two readings of the same moment. */
  createdAt: string
  replacedFrom: number | null
  wrong: boolean
  source: string
  job: { id: string; title: string; invoiceNumber: string | null; vehicleId: string | null } | null
}

/** One meter on a vehicle, with what it reads now and its history, newest first. */
export interface VehicleMeterView {
  id: string
  meterTypeId: string
  name: string
  unit: string
  current: number | null
  currentAt: string | null
  /** Across replaced meters; equal to `current` until one is replaced. */
  total: number | null
  replaced: boolean
  readings: MeterReadingView[]
}

function view(
  meter: { id: string; meterTypeId: string; readings: ReadingRow[] },
  type: MeterTypeView
): VehicleMeterView {
  const likes = meter.readings.map(asLike)
  const { current, total } = meterState(likes)
  const newestFirst = [...likes].sort((a, b) => byReadingTime(b, a))
  const rows = new Map(meter.readings.map((row) => [row.id, row]))
  return {
    id: meter.id,
    meterTypeId: meter.meterTypeId,
    name: type.name,
    unit: type.unit,
    current: current?.value ?? null,
    currentAt: current?.readAt.toISOString() ?? null,
    total,
    replaced: likes.some((r) => r.replacedFrom != null && !r.wrongAt),
    readings: newestFirst.map((like) => {
      const row = rows.get(like.id) as ReadingRow
      return {
        id: like.id,
        value: like.value,
        readAt: like.readAt.toISOString(),
        createdAt: like.createdAt.toISOString(),
        replacedFrom: like.replacedFrom,
        wrong: Boolean(like.wrongAt),
        source: row.source,
        job: row.serviceRecord
          ? {
              id: row.serviceRecord.id,
              title: row.serviceRecord.title,
              invoiceNumber: row.serviceRecord.invoiceNumber,
              vehicleId: row.serviceRecord.vehicleId,
            }
          : null,
      }
    }),
  }
}

/**
 * The meters a vehicle has, in the workshop's order, with their readings.
 * Empty while meters are off. A meter taken off the vehicle, or one the
 * workshop has hidden, is not listed; its readings stay in the database.
 */
export async function vehicleMeterViews(
  organizationId: string,
  vehicleId: string,
  types?: MeterTypeView[]
): Promise<VehicleMeterView[]> {
  const active = types ?? (await activeMeterTypes(organizationId))
  if (active.length === 0) return []
  const meters = await db.vehicleMeter.findMany({
    where: {
      organizationId,
      vehicleId,
      removedAt: null,
      meterTypeId: { in: active.map((t) => t.id) },
    },
    select: { id: true, meterTypeId: true, readings: { select: READING_SELECT } },
  })
  return active.flatMap((type) => {
    const meter = meters.find((m) => m.meterTypeId === type.id)
    return meter ? [view(meter as never, type)] : []
  })
}

/**
 * The meters of pieces of equipment, by item, in the workshop's order, with
 * their readings. An item's meters go with it from vehicle to vehicle. Empty
 * while meters are off.
 */
export async function equipmentMeterViews(
  organizationId: string,
  itemIds: string[],
  types?: MeterTypeView[]
): Promise<Map<string, VehicleMeterView[]>> {
  const byItem = new Map<string, VehicleMeterView[]>()
  if (itemIds.length === 0) return byItem
  const active = types ?? (await activeMeterTypes(organizationId))
  if (active.length === 0) return byItem
  const meters = await db.vehicleMeter.findMany({
    where: {
      organizationId,
      equipmentItemId: { in: itemIds },
      removedAt: null,
      meterTypeId: { in: active.map((t) => t.id) },
    },
    select: {
      id: true,
      meterTypeId: true,
      equipmentItemId: true,
      readings: { select: READING_SELECT },
    },
  })
  for (const itemId of itemIds) {
    byItem.set(
      itemId,
      active.flatMap((type) => {
        const meter = meters.find((m) => m.equipmentItemId === itemId && m.meterTypeId === type.id)
        return meter ? [view(meter as never, type)] : []
      })
    )
  }
  return byItem
}

/** A meter's reading on one job, and what the person typing it should not go below. */
export interface JobMeterView {
  vehicleMeterId: string
  meterTypeId: string
  name: string
  unit: string
  /** This job's reading, when it has one. */
  value: number | null
  /** The last counted reading before this job, for the lower-reading notice. */
  last: number | null
  /** The piece of equipment the meter is on, for an item the job works on. */
  item?: { id: string; label: string } | null
}

/**
 * The vehicle's meters as a job shows them: this job's reading of each, and
 * the last reading before the job. Empty while meters are off.
 */
export async function jobMeterViews(
  organizationId: string,
  job: { id: string; vehicleId: string | null; readAt: Date }
): Promise<JobMeterView[]> {
  if (!job.vehicleId) return []
  const types = await activeMeterTypes(organizationId)
  if (types.length === 0) return []
  const [vehicleMeters, itemIds] = await Promise.all([
    vehicleMeterViews(organizationId, job.vehicleId, types),
    jobWorkOnItemIds(organizationId, job),
  ])
  // Then the meters of every item the job works on, item by item.
  const [itemMeters, labels] = await Promise.all([
    equipmentMeterViews(organizationId, itemIds, types),
    equipmentLabels(organizationId, itemIds),
  ])
  const labelled = itemIds.flatMap((itemId) => {
    const label = labels.get(itemId)
    if (!label) return []
    return (itemMeters.get(itemId) ?? []).map((meter) => ({ meter, item: { id: itemId, label } }))
  })
  const all = [...vehicleMeters.map((meter) => ({ meter, item: null })), ...labelled]
  return all.map(({ meter, item }) => {
    const likes: MeterReadingLike[] = meter.readings.map((r) => ({
      id: r.id,
      value: r.value,
      readAt: new Date(r.readAt),
      createdAt: new Date(r.createdAt),
      replacedFrom: r.replacedFrom,
      wrongAt: r.wrong ? new Date(0) : null,
      serviceRecordId: r.job?.id ?? null,
    }))
    const own = meter.readings.find((r) => r.job?.id === job.id && !r.wrong)
    return {
      vehicleMeterId: meter.id,
      meterTypeId: meter.meterTypeId,
      name: meter.name,
      unit: meter.unit,
      value: own?.value ?? null,
      last: lastMeterValueBefore(
        likes.filter((r) => r.serviceRecordId !== job.id),
        { readAt: job.readAt }
      ),
      item,
    }
  })
}

/** A reading as a printed document carries it, unformatted. */
export interface PrintableMeterReading {
  name: string
  unit: string
  value: number
}

/**
 * What a document prints for the vehicle's meters, in the workshop's order:
 * the readings taken on the job, for an invoice and a work order; the
 * vehicle's current readings, for a quote, which has no job. Nothing while
 * meters are off, and nothing for a meter without a reading: an empty value
 * prints nothing.
 */
export async function printableMeterReadings(
  organizationId: string,
  source: { jobId: string; vehicleId: string | null } | { vehicleId: string | null }
): Promise<PrintableMeterReading[]> {
  const types = await activeMeterTypes(organizationId)
  if (types.length === 0) return []
  if ('jobId' in source) {
    if (!source.vehicleId) return []
    const rows = await db.meterReading.findMany({
      where: {
        organizationId,
        serviceRecordId: source.jobId,
        wrongAt: null,
        // Only the meters of the vehicle the job is on now: a reading taken
        // while the job was on another vehicle is that vehicle's.
        vehicleMeter: {
          vehicleId: source.vehicleId,
          removedAt: null,
          meterTypeId: { in: types.map((t) => t.id) },
        },
      },
      select: { value: true, vehicleMeter: { select: { meterTypeId: true } } },
    })
    return types.flatMap((type) => {
      const row = rows.find((r) => r.vehicleMeter.meterTypeId === type.id)
      return row ? [{ name: type.name, unit: type.unit, value: row.value.toNumber() }] : []
    })
  }
  if (!source.vehicleId) return []
  const meters = await vehicleMeterViews(organizationId, source.vehicleId, types)
  return meters.flatMap((meter) =>
    meter.current == null ? [] : [{ name: meter.name, unit: meter.unit, value: meter.current }]
  )
}
