'use server'

import { getTranslations } from 'next-intl/server'
import { revalidatePath } from 'next/cache'
import { publishRecordChange } from '@/lib/realtime/publish.server'
import { auditDetails } from '@/lib/audit'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/format'
import { requireFeature } from '@/lib/features'
import { isGeneratedName, parseStoredFileUrl, releaseFiles } from '@/lib/files/manager'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { vehicleName } from '@/lib/vehicle-name'
import { withAuth } from '@/lib/with-auth'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { zonedDayKey } from '@/lib/timezone'
import { activeMeterTypes } from '@/features/meters/Lib/meters.server'
import { readingTime, readingValue } from '@/features/meters/Lib/readingInput.server'
import { dayToDate, parseManufacture } from '../Lib/equipmentDays'
import { equipmentTypes } from '../Lib/equipmentGate.server'
import { equipmentLabel } from '../Lib/equipmentLabel'
import { vehicleEquipmentView } from '../Lib/equipment.server'
import {
  addEquipmentItemSchema,
  addEquipmentMeterSchema,
  moveEquipmentItemSchema,
  updateEquipmentItemSchema,
  type equipmentItemFields,
} from '../Schema/equipmentSchema'
import type { z } from 'zod'

const READ = [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }]
const UPDATE = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }]
const DELETE = [{ action: PermissionAction.DELETE, subject: PermissionSubject.VEHICLES }]

/**
 * The vehicle pages that show the item: revalidated, and told in real time,
 * since the item's rows are written with updateMany, which the realtime
 * layer announces without an id.
 */
function refresh(organizationId: string, ...vehicleIds: (string | null | undefined)[]) {
  for (const id of new Set(vehicleIds)) {
    if (!id) continue
    revalidatePath(`/vehicles/${id}`)
    publishRecordChange({ kind: 'vehicle', id, organizationId, hint: 'equipment' })
  }
}

async function vehicleDisplay(organizationId: string, vehicleId: string): Promise<string> {
  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    select: { year: true, make: true, model: true, licensePlate: true },
  })
  if (!vehicle) return vehicleId
  return `${vehicleName(vehicle)}${vehicle.licensePlate ? ` (${vehicle.licensePlate})` : ''}`
}

/** The type, when it is this workshop's and shown: a hidden type takes no new items. */
async function usableType(organizationId: string, typeId: string, keep?: string) {
  const types = await equipmentTypes(organizationId)
  const type = types.find((t) => t.id === typeId)
  if (!type || (!type.isActive && typeId !== keep)) throw new Error('Equipment type not found')
  return type
}

/**
 * The report file, when it is one this workshop uploaded for equipment. A
 * URL naming another workshop's file, or another kind of upload, is refused.
 */
function ownReport(organizationId: string, report: { url: string; name: string } | null) {
  if (!report) return null
  const file = parseStoredFileUrl(report.url)
  if (!file || file.organizationId !== organizationId || file.folder !== 'vehicles') {
    throw new Error('Not a report file')
  }
  return report
}

/** The typed fields as columns; days at UTC midnight in their `date` columns. */
async function columns(
  organizationId: string,
  data: z.output<typeof equipmentItemFields>
): Promise<{
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
}> {
  const made = data.manufacture ? parseManufacture(data.manufacture) : null
  if (data.manufacture && !made) {
    // Worded as the dialog words it: the two forms taken, the date as this
    // workshop writes one.
    const setting = await db.appSetting.findFirst({
      where: { organizationId, key: SETTING_KEYS.DATE_FORMAT },
      select: { value: true },
    })
    const sample = formatDate(new Date(2019, 4, 14), setting?.value || undefined)
    throw new Error(
      (await getTranslations('equipment.form'))('manufactureInvalid', { date: sample })
    )
  }
  if (made) {
    // Made next year at the latest: a plate can be stamped ahead of delivery.
    const thisYear = Number(
      zonedDayKey(new Date(), await workshopTimeZone(organizationId)).slice(0, 4)
    )
    if (made.year > thisYear + 1) {
      throw new Error((await getTranslations('equipment.form'))('manufactureFuture'))
    }
  }
  const report = ownReport(organizationId, data.report ?? null)
  const day = (value: string | null | undefined) => (value ? dayToDate(value) : null)
  return {
    make: data.make ?? null,
    model: data.model ?? null,
    serialNumber: data.serialNumber ?? null,
    manufactureYear: made?.year ?? null,
    manufactureDate: made?.day ? dayToDate(made.day) : null,
    installDate: day(data.installDate),
    notes: data.notes ?? null,
    ratedCapacity: data.ratedCapacity ?? null,
    nextExaminationDue: day(data.nextExaminationDue),
    lastExaminedAt: day(data.lastExaminedAt),
    certificateReference: data.certificateReference ?? null,
    reportFileUrl: report?.url ?? null,
    reportFileName: report?.name ?? null,
  }
}

/** The item in this workshop, with what the audit and a move need. */
async function ownItem(organizationId: string, id: string) {
  const item = await db.equipmentItem.findFirst({
    where: { id, organizationId },
    select: {
      id: true,
      vehicleId: true,
      removedAt: true,
      reportFileUrl: true,
      make: true,
      model: true,
      serialNumber: true,
      type: { select: { name: true } },
    },
  })
  if (!item) throw new Error('Equipment not found')
  return { ...item, label: equipmentLabel({ typeName: item.type.name, ...item }) }
}

function auditOf(
  action: string,
  details: ReturnType<typeof auditDetails>,
  result: { id: string; vehicleId: string }
) {
  return {
    action,
    entity: 'EquipmentItem',
    entityId: result.id,
    details,
    metadata: { equipmentItemId: result.id, vehicleId: result.vehicleId },
  }
}

/** A vehicle's equipment as its page shows it. Null while equipment is off. */
export async function getVehicleEquipment(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const vehicle = await db.vehicle.count({ where: { id: vehicleId, organizationId } })
      if (vehicle === 0) throw new Error('Vehicle not found')
      return vehicleEquipmentView(organizationId, vehicleId)
    },
    { requiredPermissions: READ }
  )
}

export async function addEquipmentItem(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const data = addEquipmentItemSchema.parse(input)
      const vehicle = await db.vehicle.count({ where: { id: data.vehicleId, organizationId } })
      if (vehicle === 0) throw new Error('Vehicle not found')
      await usableType(organizationId, data.typeId)
      const values = await columns(organizationId, data)
      const item = await db.$transaction(async (tx) => {
        const created = await tx.equipmentItem.create({
          data: { ...values, typeId: data.typeId, vehicleId: data.vehicleId, organizationId },
          select: { id: true },
        })
        await tx.equipmentFitting.create({
          data: { itemId: created.id, vehicleId: data.vehicleId, organizationId },
        })
        return created
      })
      refresh(organizationId, data.vehicleId)
      const own = await ownItem(organizationId, item.id)
      return {
        id: item.id,
        label: own.label,
        vehicleId: data.vehicleId,
        vehicleDisplay: await vehicleDisplay(organizationId, data.vehicleId),
      }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) =>
        auditOf(
          'equipment.add',
          auditDetails('equipment_add', { name: result.label, vehicle: result.vehicleDisplay }),
          result
        ),
    }
  )
}

export async function updateEquipmentItem(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const data = updateEquipmentItemSchema.parse(input)
      const before = await db.equipmentItem.findFirst({
        where: { id: data.id, organizationId },
        select: { id: true, typeId: true, vehicleId: true, reportFileUrl: true },
      })
      if (!before) throw new Error('Equipment not found')
      // A hidden type keeps the items it has; it is not offered to new ones.
      await usableType(organizationId, data.typeId, before.typeId)
      const values = await columns(organizationId, data)
      await db.equipmentItem.updateMany({
        where: { id: data.id, organizationId },
        data: { ...values, typeId: data.typeId },
      })
      // A report replaced or taken off: its file goes once nothing uses it.
      if (before.reportFileUrl && before.reportFileUrl !== values.reportFileUrl) {
        await releaseFiles([before.reportFileUrl], {
          organizationId,
          reason: 'equipment report replaced',
        })
      }
      refresh(organizationId, before.vehicleId)
      const own = await ownItem(organizationId, data.id)
      return {
        id: own.id,
        label: own.label,
        vehicleId: own.vehicleId,
        vehicleDisplay: await vehicleDisplay(organizationId, own.vehicleId),
      }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) =>
        auditOf(
          'equipment.update',
          auditDetails('equipment_update', { name: result.label, vehicle: result.vehicleDisplay }),
          result
        ),
    }
  )
}

/**
 * Moves an item to another of the workshop's vehicles. It keeps its meters,
 * readings and the jobs that worked on it; the old vehicle's history says
 * where it went. A job keeps what it worked on: the old vehicle's jobs still
 * show and print the item and the readings taken on them, locked or not.
 * Only new picks look at where the item is now.
 */
export async function moveEquipmentItem(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const data = moveEquipmentItemSchema.parse(input)
      const item = await ownItem(organizationId, data.id)
      if (item.vehicleId === data.vehicleId) throw new Error('Already on that vehicle')
      const target = await db.vehicle.count({ where: { id: data.vehicleId, organizationId } })
      if (target === 0) throw new Error('Vehicle not found')
      const now = new Date()
      await db.$transaction(async (tx) => {
        await tx.equipmentFitting.updateMany({
          where: { organizationId, itemId: item.id, endedAt: null },
          data: { endedAt: now, endReason: 'moved' },
        })
        await tx.equipmentItem.updateMany({
          where: { id: item.id, organizationId },
          data: { vehicleId: data.vehicleId, removedAt: null },
        })
        await tx.equipmentFitting.create({
          data: { itemId: item.id, vehicleId: data.vehicleId, organizationId, fittedAt: now },
        })
      })
      refresh(organizationId, item.vehicleId, data.vehicleId)
      return {
        id: item.id,
        label: item.label,
        vehicleId: data.vehicleId,
        vehicleDisplay: await vehicleDisplay(organizationId, data.vehicleId),
        from: await vehicleDisplay(organizationId, item.vehicleId),
      }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'equipment.move',
        entity: 'EquipmentItem',
        entityId: result.id,
        details: auditDetails('equipment_move', {
          name: result.label,
          from: result.from,
          vehicle: result.vehicleDisplay,
        }),
        metadata: { equipmentItemId: result.id, vehicleId: result.vehicleId },
      }),
    }
  )
}

/**
 * Takes an item off its vehicle. It keeps its removed date and stays in the
 * history, and the jobs that worked on it keep it and their readings of it.
 */
export async function removeEquipmentItem(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const item = await ownItem(organizationId, id)
      if (item.removedAt) throw new Error('Equipment not found')
      const now = new Date()
      await db.$transaction([
        db.equipmentItem.updateMany({
          where: { id: item.id, organizationId },
          data: { removedAt: now },
        }),
        db.equipmentFitting.updateMany({
          where: { organizationId, itemId: item.id, endedAt: null },
          data: { endedAt: now, endReason: 'removed' },
        }),
      ])
      refresh(organizationId, item.vehicleId)
      return {
        id: item.id,
        label: item.label,
        vehicleId: item.vehicleId,
        vehicleDisplay: await vehicleDisplay(organizationId, item.vehicleId),
      }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) =>
        auditOf(
          'equipment.remove',
          auditDetails('equipment_remove', { name: result.label, vehicle: result.vehicleDisplay }),
          result
        ),
    }
  )
}

/** Puts a removed item back on the vehicle it was last on. */
export async function refitEquipmentItem(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const item = await ownItem(organizationId, id)
      if (!item.removedAt) throw new Error('Equipment not found')
      await db.$transaction([
        db.equipmentItem.updateMany({
          where: { id: item.id, organizationId },
          data: { removedAt: null },
        }),
        db.equipmentFitting.create({
          data: { itemId: item.id, vehicleId: item.vehicleId, organizationId },
        }),
      ])
      refresh(organizationId, item.vehicleId)
      return {
        id: item.id,
        label: item.label,
        vehicleId: item.vehicleId,
        vehicleDisplay: await vehicleDisplay(organizationId, item.vehicleId),
      }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) =>
        auditOf(
          'equipment.refit',
          auditDetails('equipment_refit', { name: result.label, vehicle: result.vehicleDisplay }),
          result
        ),
    }
  )
}

/**
 * Deletes an item for good, with its history, its meters and their readings
 * and its report file. Removing it keeps all of that; the page asks first.
 */
export async function deleteEquipmentItem(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const item = await ownItem(organizationId, id)
      await db.equipmentItem.deleteMany({ where: { id: item.id, organizationId } })
      await releaseFiles([item.reportFileUrl], { organizationId, reason: 'equipment deleted' })
      refresh(organizationId, item.vehicleId)
      return {
        id: item.id,
        label: item.label,
        vehicleId: item.vehicleId,
        vehicleDisplay: await vehicleDisplay(organizationId, item.vehicleId),
      }
    },
    {
      requiredPermissions: DELETE,
      audit: ({ result }) =>
        auditOf(
          'equipment.delete',
          auditDetails('equipment_delete', { name: result.label, vehicle: result.vehicleDisplay }),
          result
        ),
    }
  )
}

/**
 * Lets go of a report the item dialog uploaded and never saved: the dialog
 * was cancelled, or the file taken off before saving. Only an upload of this
 * workshop's in the vehicles folder, named as the upload route names one, and
 * only once no item points at it; the file manager checks every other column
 * too and moves it to its trash, so a mistake is still recoverable.
 */
export async function discardEquipmentReport(url: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const file = parseStoredFileUrl(url)
      if (
        !file ||
        file.organizationId !== organizationId ||
        file.folder !== 'vehicles' ||
        !isGeneratedName(file.name)
      ) {
        throw new Error('Not a report file')
      }
      const used = await db.equipmentItem.count({ where: { organizationId, reportFileUrl: url } })
      if (used > 0) return { discarded: false }
      const result = await releaseFiles([url], {
        organizationId,
        reason: 'equipment report not saved',
      })
      return { discarded: result.removed.length > 0 }
    },
    { requiredPermissions: UPDATE }
  )
}

/**
 * Fits one of the workshop's meters to a piece of equipment, with a first
 * reading when one is given. A meter taken off before is put back with its
 * history. Its meters go with the item when it moves.
 */
export async function addEquipmentMeter(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireFeature(organizationId, 'customFields')
      const data = addEquipmentMeterSchema.parse(input)
      const [item, types, equipment] = await Promise.all([
        ownItem(organizationId, data.equipmentItemId),
        activeMeterTypes(organizationId),
        equipmentTypes(organizationId),
      ])
      if (equipment.length === 0 || item.removedAt) throw new Error('Equipment not found')
      const type = types.find((t) => t.id === data.meterTypeId)
      if (!type) throw new Error('Meter not found')
      const value =
        data.value !== undefined && data.value !== '' ? await readingValue(data.value) : null
      const readAt = await readingTime(organizationId, data.readOn || undefined)
      const meter = await db.$transaction(async (tx) => {
        const existing = await tx.vehicleMeter.findFirst({
          where: { organizationId, equipmentItemId: item.id, meterTypeId: type.id },
          select: { id: true },
        })
        const fitted = existing
          ? await tx.vehicleMeter.update({
              where: { id: existing.id },
              data: { removedAt: null },
              select: { id: true },
            })
          : await tx.vehicleMeter.create({
              data: { equipmentItemId: item.id, meterTypeId: type.id, organizationId },
              select: { id: true },
            })
        if (value !== null) {
          await tx.meterReading.create({
            data: { vehicleMeterId: fitted.id, value, readAt, organizationId, createdById: userId },
          })
        }
        return fitted
      })
      refresh(organizationId, item.vehicleId)
      return {
        id: meter.id,
        itemId: item.id,
        label: item.label,
        vehicleId: item.vehicleId,
        vehicleDisplay: await vehicleDisplay(organizationId, item.vehicleId),
        meter: `${type.name}${value !== null ? ` ${value}` : ''}`,
      }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'equipment.update',
        entity: 'EquipmentItem',
        entityId: result.itemId,
        details: auditDetails('equipment_meter', {
          name: result.label,
          meter: result.meter,
          vehicle: result.vehicleDisplay,
        }),
        metadata: { equipmentItemId: result.itemId, vehicleMeterId: result.id },
      }),
    }
  )
}
