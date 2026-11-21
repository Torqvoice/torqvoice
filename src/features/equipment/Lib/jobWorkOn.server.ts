import 'server-only'

import { db } from '@/lib/db'
import { assertInvoiceEditable } from '@/lib/document-lock.server'
import { publishRecordChange } from '@/lib/realtime/publish.server'
import { unlinkItemMeterReadings } from '@/features/meters/Lib/jobMeterReading.server'
import { lockJobReading } from '@/features/vehicles/Lib/vehicleReading'
import { ITEM_SELECT, byTypeThenAdded, itemView } from './equipment.server'
import {
  type WorkOnItemState,
  equipmentEnabled,
  equipmentTypes,
  jobWorkOnItemIds,
  workOnItemState,
} from './equipmentGate.server'

type ItemsClient = { equipmentItem: { findMany: typeof db.equipmentItem.findMany } }

/**
 * The items picked, checked as they are written. A newly picked item has to
 * be this workshop's, on the vehicle now and not taken off. One the work
 * already has may stay picked wherever it is now: the work keeps what it
 * worked on, moved or removed since.
 */
export async function checkedWorkOnItems(
  organizationId: string,
  vehicleId: string,
  itemIds: string[],
  already: string[],
  client: ItemsClient = db
): Promise<string[]> {
  const unique = [...new Set(itemIds)]
  if (unique.length === 0) return []
  const items = await client.equipmentItem.findMany({
    where: { organizationId, id: { in: unique } },
    select: { id: true, vehicleId: true, removedAt: true },
  })
  for (const id of unique) {
    const item = items.find((i) => i.id === id)
    if (!item) throw new Error('Equipment not found')
    if (already.includes(id)) continue
    if (item.vehicleId !== vehicleId || item.removedAt) throw new Error('Equipment not found')
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
 * - The job has to be this workshop's and have a vehicle, and every newly
 *   picked item has to be on that vehicle now (see `checkedWorkOnItems`).
 * - A locked invoice refuses the change (DocumentLockedError): what it printed
 *   is frozen with it.
 * - What the job had before is read under the job's row lock, in the same
 *   transaction as the write, the lock the job's own save takes: the page and
 *   the technician app saving at once take turns, and the second works from
 *   what the first wrote rather than a mix of the two.
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
  const { vehicleId, itemIds, changed } = await db.$transaction(async (tx) => {
    const locked = await lockJobReading(tx, { organizationId, jobId: job.id })
    if (!locked?.vehicleId) throw new Error('Work order not found')
    const before = (
      await tx.serviceRecordEquipment.findMany({
        where: { organizationId, serviceRecordId: job.id },
        select: { itemId: true },
      })
    ).map((row) => row.itemId)
    const itemIds = await checkedWorkOnItems(
      organizationId,
      locked.vehicleId,
      input.itemIds,
      before,
      tx
    )
    const dropped = before.filter((id) => !itemIds.includes(id))
    const added = itemIds.filter((id) => !before.includes(id))
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
    return {
      vehicleId: locked.vehicleId,
      itemIds,
      changed: dropped.length > 0 || added.length > 0,
    }
  })
  // These are bulk writes, which the realtime layer announces without a
  // record: a work order open elsewhere is told by name.
  if (changed) {
    publishRecordChange({ kind: 'serviceRecord', id: job.id, organizationId, hint: 'equipment' })
  }
  return {
    jobId: job.id,
    jobRef: job.invoiceNumber || job.id,
    vehicleId,
    itemIds,
  }
}

/** A job's equipment as the technician app reads it. */
export interface AppJobEquipment {
  /**
   * Every item on the job's vehicle now, and every item the job works on
   * wherever it is now (moved to another vehicle or taken off since).
   */
  items: {
    id: string
    label: string
    /** The workshop's name for its kind: "Crane", "Tail lift". */
    type: string
    make: string | null
    model: string | null
    serialNumber: string | null
    /**
     * Moved to another vehicle or taken off since the job picked it: it stays
     * on the job, can be unpicked, and cannot be picked again.
     */
    removed: boolean
    /** Which of the two: "moved", "removed", or null for an item on the job's vehicle. */
    state: WorkOnItemState
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
  // An item moved or removed since still shows on the job that worked on it.
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
      const state = workOnItemState(row, job.vehicleId as string)
      return {
        id: view.id,
        label: view.label,
        type: view.typeName,
        make: view.make,
        model: view.model,
        serialNumber: view.serialNumber,
        removed: state !== null,
        state,
      }
    }),
    workOn,
  }
}
