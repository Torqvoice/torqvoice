import 'server-only'

import { db } from '@/lib/db'
import {
  type MeterTypeView,
  type VehicleMeterView,
  activeMeterTypes,
  equipmentMeterViews,
} from '@/features/meters/Lib/meters.server'
import { vehicleName } from '@/lib/vehicle-name'
import { dateToDay } from './equipmentDays'
import { type EquipmentTypeView, equipmentTypes, jobWorkOnItemIds } from './equipmentGate.server'
import { equipmentLabel } from './equipmentLabel'

export { equipmentEnabled, equipmentTypes, jobWorkOnItemIds } from './equipmentGate.server'
export type { EquipmentTypeView } from './equipmentGate.server'

/** One piece of equipment as a page shows it. Days are day keys ("2026-11-20"). */
export interface EquipmentItemView {
  id: string
  typeId: string
  typeName: string
  label: string
  make: string | null
  model: string | null
  serialNumber: string | null
  manufactureYear: number | null
  manufactureDay: string | null
  installDate: string | null
  notes: string | null
  ratedCapacity: string | null
  nextExaminationDue: string | null
  lastExaminedAt: string | null
  certificateReference: string | null
  report: { url: string; name: string } | null
  removedAt: string | null
  vehicleId: string
  meters: VehicleMeterView[]
}

/** A time an item was on this vehicle and left it. */
export interface EquipmentHistoryView {
  fittingId: string
  item: EquipmentItemView
  fittedAt: string
  endedAt: string
  /** "moved" to another vehicle, or "removed". */
  endReason: 'moved' | 'removed'
  /** Where it went, when it was moved and that vehicle is this workshop's. */
  movedTo: { id: string; name: string } | null
}

/** A vehicle's equipment: what is on it now, and what was on it before. */
export interface VehicleEquipmentView {
  types: EquipmentTypeView[]
  meterTypes: MeterTypeView[]
  items: EquipmentItemView[]
  history: EquipmentHistoryView[]
}

export const ITEM_SELECT = {
  id: true,
  typeId: true,
  make: true,
  model: true,
  serialNumber: true,
  manufactureYear: true,
  manufactureDate: true,
  installDate: true,
  notes: true,
  ratedCapacity: true,
  nextExaminationDue: true,
  lastExaminedAt: true,
  certificateReference: true,
  reportFileUrl: true,
  reportFileName: true,
  removedAt: true,
  vehicleId: true,
  createdAt: true,
  type: { select: { name: true, sortOrder: true } },
} as const

export type ItemRow = {
  id: string
  typeId: string
  make: string | null
  model: string | null
  serialNumber: string | null
  manufactureYear: number | null
  manufactureDate: Date | null
  installDate: Date | null
  notes: string | null
  ratedCapacity: string | null
  nextExaminationDue: Date | null
  lastExaminedAt: Date | null
  certificateReference: string | null
  reportFileUrl: string | null
  reportFileName: string | null
  removedAt: Date | null
  vehicleId: string
  createdAt: Date
  type: { name: string; sortOrder: number }
}

export function itemView(row: ItemRow, meters: VehicleMeterView[] = []): EquipmentItemView {
  return {
    id: row.id,
    typeId: row.typeId,
    typeName: row.type.name,
    label: equipmentLabel({ typeName: row.type.name, ...row }),
    make: row.make,
    model: row.model,
    serialNumber: row.serialNumber,
    manufactureYear: row.manufactureYear,
    manufactureDay: dateToDay(row.manufactureDate),
    installDate: dateToDay(row.installDate),
    notes: row.notes,
    ratedCapacity: row.ratedCapacity,
    nextExaminationDue: dateToDay(row.nextExaminationDue),
    lastExaminedAt: dateToDay(row.lastExaminedAt),
    certificateReference: row.certificateReference,
    report:
      row.reportFileUrl && row.reportFileName
        ? { url: row.reportFileUrl, name: row.reportFileName }
        : null,
    removedAt: row.removedAt?.toISOString() ?? null,
    vehicleId: row.vehicleId,
    meters,
  }
}

/** Items in the workshop's order of types, then in the order they were added. */
export function byTypeThenAdded(a: ItemRow, b: ItemRow): number {
  return a.type.sortOrder - b.type.sortOrder || a.createdAt.getTime() - b.createdAt.getTime()
}

/**
 * Everything the vehicle page shows about a vehicle's equipment. Null while
 * equipment is off, so the page draws nothing.
 */
export async function vehicleEquipmentView(
  organizationId: string,
  vehicleId: string
): Promise<VehicleEquipmentView | null> {
  const types = await equipmentTypes(organizationId)
  if (types.length === 0) return null
  const [rows, fittings, meterTypes] = await Promise.all([
    db.equipmentItem.findMany({
      where: { organizationId, vehicleId, removedAt: null },
      select: ITEM_SELECT,
    }),
    db.equipmentFitting.findMany({
      where: { organizationId, vehicleId, endedAt: { not: null } },
      orderBy: { endedAt: 'desc' },
      select: {
        id: true,
        fittedAt: true,
        endedAt: true,
        endReason: true,
        item: {
          select: {
            ...ITEM_SELECT,
            vehicle: {
              select: { id: true, year: true, make: true, model: true, licensePlate: true },
            },
          },
        },
      },
    }),
    activeMeterTypes(organizationId),
  ])
  rows.sort(byTypeThenAdded)
  const meters = await equipmentMeterViews(
    organizationId,
    rows.map((r) => r.id),
    meterTypes
  )
  return {
    types,
    meterTypes,
    items: rows.map((row) => itemView(row, meters.get(row.id) ?? [])),
    history: fittings.map((fitting) => {
      const moved = fitting.endReason === 'moved' && fitting.item.vehicleId !== vehicleId
      const to = fitting.item.vehicle
      return {
        fittingId: fitting.id,
        item: itemView(fitting.item),
        fittedAt: fitting.fittedAt.toISOString(),
        endedAt: (fitting.endedAt as Date).toISOString(),
        endReason: fitting.endReason === 'moved' ? 'moved' : 'removed',
        movedTo: moved
          ? {
              id: to.id,
              name: `${vehicleName(to)}${to.licensePlate ? ` (${to.licensePlate})` : ''}`,
            }
          : null,
      }
    }),
  }
}

/** What the work order's "Work on" offers and has picked. Null while equipment is off. */
export interface JobEquipmentView {
  /** Every item on the job's vehicle now, the ones it works on included. */
  items: { id: string; label: string; typeName: string }[]
  /** The ones it works on. */
  selected: string[]
}

export async function jobEquipmentView(
  organizationId: string,
  job: { id: string; vehicleId: string | null }
): Promise<JobEquipmentView | null> {
  const types = await equipmentTypes(organizationId)
  if (types.length === 0 || !job.vehicleId) return null
  const [rows, selected] = await Promise.all([
    db.equipmentItem.findMany({
      where: { organizationId, vehicleId: job.vehicleId, removedAt: null },
      select: ITEM_SELECT,
    }),
    jobWorkOnItemIds(organizationId, job, true),
  ])
  // An item removed since still shows on the job that worked on it.
  const missing = selected.filter((id) => !rows.some((r) => r.id === id))
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
      return { id: view.id, label: view.label, typeName: view.typeName }
    }),
    selected,
  }
}

/** The same for a quote, which carries its picks to the job it becomes. */
export async function quoteEquipmentView(
  organizationId: string,
  quote: { id: string; vehicleId: string | null }
): Promise<JobEquipmentView | null> {
  const types = await equipmentTypes(organizationId)
  if (types.length === 0 || !quote.vehicleId) return null
  const [rows, picked] = await Promise.all([
    db.equipmentItem.findMany({
      where: { organizationId, vehicleId: quote.vehicleId, removedAt: null },
      select: ITEM_SELECT,
    }),
    db.quoteEquipment.findMany({
      where: { organizationId, quoteId: quote.id, item: { vehicleId: quote.vehicleId } },
      orderBy: { createdAt: 'asc' },
      select: { itemId: true },
    }),
  ])
  rows.sort(byTypeThenAdded)
  return {
    items: rows.map((row) => {
      const view = itemView(row)
      return { id: view.id, label: view.label, typeName: view.typeName }
    }),
    selected: picked.map((p) => p.itemId).filter((id) => rows.some((r) => r.id === id)),
  }
}
