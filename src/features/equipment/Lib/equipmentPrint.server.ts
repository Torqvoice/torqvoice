import 'server-only'

import { db } from '@/lib/db'
import { activeMeterTypes, equipmentMeterViews } from '@/features/meters/Lib/meters.server'
import type { PrintableEquipment, PrintableEquipmentLists } from './equipmentPrint'
import { ITEM_SELECT, type ItemRow, byTypeThenAdded } from './equipment.server'
import { equipmentTypes, jobWorkOnItemIds } from './equipmentGate.server'
import { dateToDay } from './equipmentDays'

export const NO_EQUIPMENT: PrintableEquipmentLists = { job: [], vehicle: [] }

function printable(row: ItemRow, meters: PrintableEquipment['meters']): PrintableEquipment {
  return {
    type: row.type.name,
    make: row.make,
    model: row.model,
    serialNumber: row.serialNumber,
    manufactureYear: row.manufactureYear,
    installDate: dateToDay(row.installDate),
    ratedCapacity: row.ratedCapacity,
    nextExaminationDue: dateToDay(row.nextExaminationDue),
    lastExaminedAt: dateToDay(row.lastExaminedAt),
    certificateReference: row.certificateReference,
    notes: row.notes,
    meters,
  }
}

/**
 * What a document can print in its Equipment section, both lists, since the
 * design picks one: the items the job (or quote) works on, and everything on
 * the vehicle now. On the job's list each item's meters print the readings
 * taken on that job; on the vehicle's list, what each reads now. Nothing
 * while equipment is off.
 */
export async function printableEquipment(
  organizationId: string,
  source:
    | { jobId: string; vehicleId: string | null }
    | { quoteId: string; vehicleId: string | null }
    | { vehicleId: string | null }
): Promise<PrintableEquipmentLists> {
  if (!source.vehicleId) return NO_EQUIPMENT
  if ((await equipmentTypes(organizationId)).length === 0) return NO_EQUIPMENT
  const vehicleId = source.vehicleId

  let pickedIds: string[] = []
  if ('jobId' in source) {
    pickedIds = await jobWorkOnItemIds(organizationId, { id: source.jobId, vehicleId }, true)
  } else if ('quoteId' in source) {
    pickedIds = (
      await db.quoteEquipment.findMany({
        where: { organizationId, quoteId: source.quoteId, item: { vehicleId } },
        orderBy: { createdAt: 'asc' },
        select: { itemId: true },
      })
    ).map((row) => row.itemId)
  }

  const rows = await db.equipmentItem.findMany({
    where: {
      organizationId,
      OR: [
        { vehicleId, removedAt: null },
        ...(pickedIds.length ? [{ id: { in: pickedIds } }] : []),
      ],
    },
    select: ITEM_SELECT,
  })
  rows.sort(byTypeThenAdded)
  const meterTypes = await activeMeterTypes(organizationId)
  const current = await equipmentMeterViews(
    organizationId,
    rows.map((r) => r.id),
    meterTypes
  )

  // The job's own readings of its items' meters.
  const jobReadings =
    'jobId' in source && pickedIds.length > 0 && meterTypes.length > 0
      ? await db.meterReading.findMany({
          where: {
            organizationId,
            serviceRecordId: source.jobId,
            wrongAt: null,
            vehicleMeter: {
              equipmentItemId: { in: pickedIds },
              removedAt: null,
              meterTypeId: { in: meterTypes.map((t) => t.id) },
            },
          },
          select: {
            value: true,
            vehicleMeter: { select: { equipmentItemId: true, meterTypeId: true } },
          },
        })
      : []

  const picked = pickedIds.flatMap((id) => {
    const row = rows.find((r) => r.id === id)
    if (!row) return []
    const meters =
      'jobId' in source
        ? meterTypes.flatMap((type) => {
            const reading = jobReadings.find(
              (r) => r.vehicleMeter.equipmentItemId === id && r.vehicleMeter.meterTypeId === type.id
            )
            return reading
              ? [{ name: type.name, unit: type.unit, value: reading.value.toNumber() }]
              : []
          })
        : nowReadings(current.get(id))
    return [{ row, meters }]
  })
  picked.sort((a, b) => byTypeThenAdded(a.row, b.row))

  return {
    job: picked.map(({ row, meters }) => printable(row, meters)),
    vehicle: rows
      .filter((row) => row.vehicleId === vehicleId && !row.removedAt)
      .map((row) => printable(row, nowReadings(current.get(row.id)))),
  }
}

function nowReadings(
  meters: { name: string; unit: string; current: number | null }[] | undefined
): PrintableEquipment['meters'] {
  return (meters ?? []).flatMap((meter) =>
    meter.current == null ? [] : [{ name: meter.name, unit: meter.unit, value: meter.current }]
  )
}
