import 'server-only'

import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { equipmentLabel } from './equipmentLabel'

/** One of the workshop's kinds of equipment. */
export interface EquipmentTypeView {
  id: string
  name: string
  /** Hidden types are left out of pickers; their items still show. */
  isActive: boolean
}

/**
 * The workshop's kinds of equipment, shown and hidden, in its order. Empty
 * for a workshop that has defined none, and for one whose plan has no custom
 * fields: then nothing about equipment shows anywhere, and its items are
 * kept. The plan is asked first, so a workshop without it costs no query on
 * equipment at all. Every reader of equipment starts here.
 */
export async function equipmentTypes(organizationId: string): Promise<EquipmentTypeView[]> {
  if (!(await getFeatures(organizationId)).customFields) return []
  return db.equipmentType.findMany({
    where: { organizationId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, isActive: true },
  })
}

/** Whether equipment shows at all for this workshop. */
export async function equipmentEnabled(organizationId: string): Promise<boolean> {
  return (await equipmentTypes(organizationId)).length > 0
}

/**
 * The items a job works on ("Work on"), in the order they were picked. A job
 * keeps what it worked on: an item moved to another vehicle or taken off
 * since is still the job's to show, read and print. Which vehicle an item is
 * on is only asked when it is newly picked (`checkedWorkOnItems`), and a job
 * that moves to another vehicle drops its links in that save. Empty while
 * equipment is off.
 */
export async function jobWorkOnItemIds(
  organizationId: string,
  job: { id: string; vehicleId: string | null },
  enabled?: boolean
): Promise<string[]> {
  if (!job.vehicleId) return []
  if (!(enabled ?? (await equipmentEnabled(organizationId)))) return []
  const rows = await db.serviceRecordEquipment.findMany({
    where: {
      organizationId,
      serviceRecordId: job.id,
      item: { organizationId },
    },
    orderBy: { createdAt: 'asc' },
    select: { itemId: true },
  })
  return rows.map((row) => row.itemId)
}

/**
 * Where an item stands for work that already has it: on the vehicle the work
 * is for (null), moved to another vehicle since, or taken off. A moved or
 * removed item stays on the work but cannot be newly picked.
 */
export type WorkOnItemState = 'moved' | 'removed' | null

export function workOnItemState(
  item: { vehicleId: string; removedAt: Date | string | null },
  vehicleId: string
): WorkOnItemState {
  if (item.vehicleId !== vehicleId) return 'moved'
  if (item.removedAt) return 'removed'
  return null
}

/**
 * How the job's items are named beside their meters. Takes ids that came
 * through `jobWorkOnItemIds`, so it is behind the same gate.
 */
export async function equipmentLabels(
  organizationId: string,
  itemIds: string[]
): Promise<Map<string, string>> {
  if (itemIds.length === 0) return new Map()
  const items = await db.equipmentItem.findMany({
    where: { organizationId, id: { in: itemIds } },
    select: {
      id: true,
      make: true,
      model: true,
      serialNumber: true,
      type: { select: { name: true } },
    },
  })
  return new Map(
    items.map((item) => [item.id, equipmentLabel({ typeName: item.type.name, ...item })])
  )
}
