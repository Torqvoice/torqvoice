import 'server-only'

import { db } from '@/lib/db'
import { assertInvoiceEditable } from '@/lib/document-lock.server'
import { publishRecordChange } from '@/lib/realtime/publish.server'
import { unlinkItemMeterReadings } from '@/features/meters/Lib/jobMeterReading.server'
import { ITEM_SELECT, byTypeThenAdded, itemView } from './equipment.server'
import { equipmentEnabled, equipmentTypes, jobWorkOnItemIds } from './equipmentGate.server'

/**
 * The items picked are this workshop's and on the vehicle. One removed since
 * may stay picked on the work that already had it; a removed one cannot be
 * newly picked.
 */
export async function checkedWorkOnItems(
  organizationId: string,
  vehicleId: string,
  itemIds: string[],
  already: string[]
): Promise<string[]> {
  const unique = [...new Set(itemIds)]
  if (unique.length === 0) return []
  const items = await db.equipmentItem.findMany({
    where: { organizationId, vehicleId, id: { in: unique } },
    select: { id: true, removedAt: true },
  })
  for (const id of unique) {
    const item = items.find((i) => i.id === id)
    if (!item || (item.removedAt && !already.includes(id))) throw new Error('Equipment not found')
  }
  return unique
}

export interface JobWorkOnResult {
  jobId: string
  /** How the job is named in its history: its number, else its id. */
  jobRef: string
  vehicleId: string
  itemIds: string[]
}

/**
 * What a work order works on ("Work on"), set as a whole: the work order page
 * and the technician app both come through here.
 *
 * - Nothing while equipment is off: refused as "Equipment not found".
 * - The job has to be this workshop's and have a vehicle, and every item has
 *   to be on that vehicle (see `checkedWorkOnItems`).
 * - A locked invoice refuses the change (DocumentLockedError): what it printed
 *   is frozen with it.
 * - An item taken off the list takes its meter readings on this job with it:
 *   they stay in the item's history, no longer the job's.
 */
export async function writeJobWorkOn(input: {
  organizationId: string
  jobId: string
  itemIds: string[]
}): Promise<JobWorkOnResult> {
  const { organizationId } = input
  if (!(await equipmentEnabled(organizationId))) throw new Error('Equipment not found')
  const job = await db.serviceRecord.findFirst({
    where: { id: input.jobId, organizationId },
    select: { id: true, vehicleId: true, invoiceNumber: true },
  })
  if (!job?.vehicleId) throw new Error('Work order not found')
  await assertInvoiceEditable(job.id, organizationId)
  const before = (
    await db.serviceRecordEquipment.findMany({
      where: { organizationId, serviceRecordId: job.id },
      select: { itemId: true },
    })
  ).map((row) => row.itemId)
  const itemIds = await checkedWorkOnItems(organizationId, job.vehicleId, input.itemIds, before)
  const dropped = before.filter((id) => !itemIds.includes(id))
  const added = itemIds.filter((id) => !before.includes(id))
  await db.$transaction(async (tx) => {
    if (dropped.length > 0) {
      await tx.serviceRecordEquipment.deleteMany({
        where: { organizationId, serviceRecordId: job.id, itemId: { in: dropped } },
      })
      await unlinkItemMeterReadings(tx, {
        organizationId,
        itemIds: dropped,
        jobIds: [job.id],
      })
    }
    if (added.length > 0) {
      await tx.serviceRecordEquipment.createMany({
        data: added.map((itemId) => ({ serviceRecordId: job.id, itemId, organizationId })),
        skipDuplicates: true,
      })
    }
  })
  // These are bulk writes, which the realtime layer announces without a
  // record: a work order open elsewhere is told by name.
  if (dropped.length > 0 || added.length > 0) {
    publishRecordChange({ kind: 'serviceRecord', id: job.id, organizationId, hint: 'equipment' })
  }
  return {
    jobId: job.id,
    jobRef: job.invoiceNumber || job.id,
    vehicleId: job.vehicleId,
    itemIds,
  }
}

/** A job's equipment as the technician app reads it. */
export interface AppJobEquipment {
  /** Every item on the job's vehicle now, and any it works on removed since. */
  items: {
    id: string
    label: string
    /** The workshop's name for its kind: "Crane", "Tail lift". */
    type: string
    make: string | null
    model: string | null
    serialNumber: string | null
    /** Taken off the vehicle since the job picked it: it cannot be picked again. */
    removed: boolean
  }[]
  /** The ones the job works on, in the order they were picked. */
  workOn: string[]
}

/**
 * The job's equipment for the technician app (`vehicle-equipment`). Null
 * while equipment is off or the job has no vehicle, with no query on
 * equipment for a workshop whose plan has none.
 */
export async function appJobEquipment(
  organizationId: string,
  job: { id: string; vehicleId: string | null }
): Promise<AppJobEquipment | null> {
  if (!job.vehicleId) return null
  const types = await equipmentTypes(organizationId)
  if (types.length === 0) return null
  const [rows, workOn] = await Promise.all([
    db.equipmentItem.findMany({
      where: { organizationId, vehicleId: job.vehicleId, removedAt: null },
      select: ITEM_SELECT,
    }),
    jobWorkOnItemIds(organizationId, job, true),
  ])
  // An item removed since still shows on the job that worked on it.
  const missing = workOn.filter((id) => !rows.some((r) => r.id === id))
  if (missing.length > 0) {
    rows.push(
      ...(await db.equipmentItem.findMany({
        where: { organizationId, id: { in: missing } },
        select: ITEM_SELECT,
      }))
    )
  }
  rows.sort(byTypeThenAdded)
  return {
    items: rows.map((row) => {
      const view = itemView(row)
      return {
        id: view.id,
        label: view.label,
        type: view.typeName,
        make: view.make,
        model: view.model,
        serialNumber: view.serialNumber,
        removed: view.removedAt !== null,
      }
    }),
    workOn,
  }
}
