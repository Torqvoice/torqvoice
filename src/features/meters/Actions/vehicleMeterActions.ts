'use server'

import { auditDetails } from '@/lib/audit'
import { assertInvoiceEditable } from '@/lib/document-lock.server'
import { vehicleName } from '@/lib/vehicle-name'
import { READING_JOB_DATES, effectiveReadAt } from '../Lib/readingTime'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireFeature } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { activeMeterTypes, vehicleMeterViews } from '../Lib/meters.server'
import { lastMeterValueBefore } from '../Lib/meterValue'
import { readingTime, readingValue } from '../Lib/readingInput.server'
import {
  addMeterReadingSchema,
  addVehicleMeterSchema,
  markMeterReadingSchema,
  replaceVehicleMeterSchema,
} from '../Schema/meterSchema'

const READ = [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }]
const UPDATE = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }]

/** The vehicle's own meter, in this workshop, with what a reading on it needs. */
async function ownMeter(organizationId: string, vehicleMeterId: string) {
  const meter = await db.vehicleMeter.findFirst({
    where: { id: vehicleMeterId, organizationId, removedAt: null },
    select: {
      id: true,
      vehicleId: true,
      equipmentItem: { select: { vehicleId: true, removedAt: true } },
      meterType: { select: { name: true, isActive: true } },
      readings: {
        select: {
          id: true,
          value: true,
          readAt: true,
          createdAt: true,
          replacedFrom: true,
          wrongAt: true,
          serviceRecord: { select: READING_JOB_DATES },
        },
      },
    },
  })
  if (!meter || !meter.meterType.isActive) throw new Error('Meter not found')
  // A removed item's meters are history: read, never written.
  if (meter.equipmentItem?.removedAt) throw new Error('Meter not found')
  return {
    ...meter,
    vehicleId: meterVehicleId(meter),
    likes: meter.readings.map((r) => ({
      id: r.id,
      value: r.value.toNumber(),
      readAt: effectiveReadAt(r),
      createdAt: r.createdAt,
      replacedFrom: r.replacedFrom ? r.replacedFrom.toNumber() : null,
      wrongAt: r.wrongAt,
    })),
  }
}

/**
 * The vehicle a meter is on: its own, or the one its piece of equipment is on
 * now. Its page is what refreshes and what the audit names.
 */
function meterVehicleId(meter: {
  vehicleId: string | null
  equipmentItem: { vehicleId: string } | null
}): string {
  return meter.vehicleId ?? meter.equipmentItem?.vehicleId ?? ''
}

/** "2019 Scania R 450 (ZZ19 TST)": how a vehicle is named in the audit log. */
async function vehicleDisplay(organizationId: string, vehicleId: string): Promise<string> {
  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    select: { year: true, make: true, model: true, licensePlate: true },
  })
  if (!vehicle) return vehicleId
  return `${vehicleName(vehicle)}${vehicle.licensePlate ? ` (${vehicle.licensePlate})` : ''}`
}

function refresh(vehicleId: string) {
  revalidatePath(`/vehicles/${vehicleId}`)
}

/** A vehicle's meters with their readings, as its page shows them. */
export async function getVehicleMeters(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const vehicle = await db.vehicle.count({ where: { id: vehicleId, organizationId } })
      if (vehicle === 0) throw new Error('Vehicle not found')
      return vehicleMeterViews(organizationId, vehicleId)
    },
    { requiredPermissions: READ }
  )
}

/**
 * Fits one of the workshop's meters to a vehicle, with a first reading when
 * one is given. A meter taken off before is put back with its history.
 */
export async function addVehicleMeter(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireFeature(organizationId, 'customFields')
      const data = addVehicleMeterSchema.parse(input)
      const [vehicle, types] = await Promise.all([
        db.vehicle.count({ where: { id: data.vehicleId, organizationId } }),
        activeMeterTypes(organizationId),
      ])
      if (vehicle === 0) throw new Error('Vehicle not found')
      if (!types.some((t) => t.id === data.meterTypeId)) throw new Error('Meter not found')
      const value =
        data.value !== undefined && data.value !== '' ? await readingValue(data.value) : null
      const readAt = await readingTime(organizationId, data.readOn || undefined)

      const meter = await db.$transaction(async (tx) => {
        const fitted = await tx.vehicleMeter.upsert({
          where: {
            vehicleId_meterTypeId: { vehicleId: data.vehicleId, meterTypeId: data.meterTypeId },
          },
          create: { vehicleId: data.vehicleId, meterTypeId: data.meterTypeId, organizationId },
          update: { removedAt: null },
        })
        if (value !== null) {
          await tx.meterReading.create({
            data: {
              vehicleMeterId: fitted.id,
              value,
              readAt,
              organizationId,
              createdById: userId,
            },
          })
        }
        return fitted
      })
      refresh(data.vehicleId)
      const type = types.find((t) => t.id === data.meterTypeId)
      return {
        id: meter.id,
        vehicleId: data.vehicleId,
        vehicleDisplay: await vehicleDisplay(organizationId, data.vehicleId),
        change: `${type?.name ?? ''}${value !== null ? ` ${value}` : ''}`,
      }
    },
    {
      requiredPermissions: UPDATE,
      // Logged like any other change to the vehicle.
      audit: ({ result }) => ({
        action: 'vehicle.update',
        entity: 'Vehicle',
        entityId: result.vehicleId,
        details: auditDetails('vehicle_update', {
          name: result.vehicleDisplay,
          fields: result.change,
        }),
        metadata: { vehicleId: result.vehicleId, vehicleMeterId: result.id, via: 'meters' },
      }),
    }
  )
}

/** Takes a meter off a vehicle. Its readings stay, and come back if it is fitted again. */
export async function removeVehicleMeter(vehicleMeterId: string) {
  return withAuth(
    async ({ organizationId }) => {
      // Not on a plan without meters: their data is hidden there, and kept.
      await requireFeature(organizationId, 'customFields')
      const meter = await db.vehicleMeter.findFirst({
        where: { id: vehicleMeterId, organizationId, removedAt: null },
        select: {
          id: true,
          vehicleId: true,
          equipmentItem: { select: { vehicleId: true, removedAt: true } },
          meterType: { select: { name: true } },
        },
      })
      if (!meter) throw new Error('Meter not found')
      await db.vehicleMeter.updateMany({
        where: { id: vehicleMeterId, organizationId },
        data: { removedAt: new Date() },
      })
      const vehicleId = meterVehicleId(meter)
      refresh(vehicleId)
      return { id: meter.id, vehicleId, name: meter.meterType.name }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'vehicleMeter.remove',
        entity: 'Vehicle',
        entityId: result.vehicleId,
        details: { key: 'vehicleMeter_remove', params: { name: result.name } },
        metadata: { vehicleMeterId: result.id },
      }),
    }
  )
}

/**
 * Adds a reading typed on the vehicle. A reading below the last one is
 * saved all the same (meters are misread and replaced); the answer says so,
 * and the page shows it.
 */
export async function addMeterReading(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireFeature(organizationId, 'customFields')
      const data = addMeterReadingSchema.parse(input)
      const meter = await ownMeter(organizationId, data.vehicleMeterId)
      const value = await readingValue(data.value)
      const readAt = await readingTime(organizationId, data.readOn || undefined)
      const last = lastMeterValueBefore(meter.likes, { readAt })
      const reading = await db.meterReading.create({
        data: { vehicleMeterId: meter.id, value, readAt, organizationId, createdById: userId },
        select: { id: true },
      })
      refresh(meter.vehicleId)
      return {
        id: reading.id,
        lower: last !== null && value < last,
        last,
        vehicleId: meter.vehicleId,
        vehicleDisplay: await vehicleDisplay(organizationId, meter.vehicleId),
        change: `${meter.meterType.name} ${value}`,
      }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'vehicle.update',
        entity: 'Vehicle',
        entityId: result.vehicleId,
        details: auditDetails('vehicle_update', {
          name: result.vehicleDisplay,
          fields: result.change,
        }),
        metadata: { vehicleId: result.vehicleId, readingId: result.id, via: 'meters' },
      }),
    }
  )
}

/**
 * Marks a reading as wrong, or counts it again. It stays in the history
 * either way; a wrong one no longer counts as the meter's reading, prints on
 * nothing new and is not what the next reading is checked against.
 */
export async function markMeterReadingWrong(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireFeature(organizationId, 'customFields')
      const data = markMeterReadingSchema.parse(input)
      const reading = await db.meterReading.findFirst({
        where: { id: data.readingId, organizationId },
        select: {
          id: true,
          value: true,
          serviceRecordId: true,
          vehicleMeter: {
            select: {
              vehicleId: true,
              equipmentItem: { select: { vehicleId: true, removedAt: true } },
              meterType: { select: { name: true } },
            },
          },
        },
      })
      if (!reading) throw new Error('Reading not found')
      // A job's reading is part of what its invoice printed: a locked invoice
      // refuses this as it refuses typing the reading again.
      if (reading.serviceRecordId)
        await assertInvoiceEditable(reading.serviceRecordId, organizationId)
      await db.meterReading.updateMany({
        where: { id: reading.id, organizationId },
        data: data.wrong
          ? { wrongAt: new Date(), wrongById: userId }
          : { wrongAt: null, wrongById: null },
      })
      const vehicleId = meterVehicleId(reading.vehicleMeter)
      refresh(vehicleId)
      return {
        id: reading.id,
        wrong: data.wrong,
        vehicleId,
        name: reading.vehicleMeter.meterType.name,
        value: reading.value.toString(),
      }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) =>
        result.wrong
          ? {
              action: 'meterReading.markWrong',
              entity: 'Vehicle',
              entityId: result.vehicleId,
              details: {
                key: 'meterReading_markWrong',
                params: { name: result.name, value: result.value },
              },
              metadata: { readingId: result.id },
            }
          : {
              action: 'meterReading.restore',
              entity: 'Vehicle',
              entityId: result.vehicleId,
              details: {
                key: 'meterReading_restore',
                params: { name: result.name, value: result.value },
              },
              metadata: { readingId: result.id },
            },
    }
  )
}

/**
 * Records that a meter was replaced: the old one came off at `oldEnd`, the
 * new one went on at `newStart`. The running total carries the old counter
 * on, and readings on the new counter are checked against it alone.
 */
export async function replaceVehicleMeter(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireFeature(organizationId, 'customFields')
      const data = replaceVehicleMeterSchema.parse(input)
      const meter = await ownMeter(organizationId, data.vehicleMeterId)
      const oldEnd = await readingValue(data.oldEnd)
      const newStart = await readingValue(data.newStart)
      const readAt = await readingTime(organizationId, data.readOn || undefined)
      await db.meterReading.create({
        data: {
          vehicleMeterId: meter.id,
          value: newStart,
          replacedFrom: oldEnd,
          readAt,
          organizationId,
          createdById: userId,
        },
      })
      refresh(meter.vehicleId)
      return {
        vehicleId: meter.vehicleId,
        vehicleMeterId: meter.id,
        name: meter.meterType.name,
        oldEnd: String(oldEnd),
        newStart: String(newStart),
      }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'vehicleMeter.replace',
        entity: 'Vehicle',
        entityId: result.vehicleId,
        details: {
          key: 'vehicleMeter_replace',
          params: { name: result.name, oldEnd: result.oldEnd, newStart: result.newStart },
        },
        metadata: { vehicleMeterId: result.vehicleMeterId },
      }),
    }
  )
}
