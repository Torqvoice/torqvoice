'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import {
  checkInSchema,
  checkOutSchema,
  relocateSchema,
  updateTireSetSchema,
} from '../Schema/tireHotelSchema'
import type { MeasurementInput } from '../Schema/tireHotelSchema'
import { requireTireHotel } from '../Lib/tireHotelSettings'

const READ = [{ action: PermissionAction.READ, subject: PermissionSubject.TIRE_HOTEL }]
const CREATE = [{ action: PermissionAction.CREATE, subject: PermissionSubject.TIRE_HOTEL }]
const UPDATE = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.TIRE_HOTEL }]
const DELETE = [{ action: PermissionAction.DELETE, subject: PermissionSubject.TIRE_HOTEL }]

function revalidateTireHotel() {
  revalidatePath('/tire-hotel')
  revalidatePath('/tire-hotel/storage')
}

/**
 * Sequential per-organization reference, so staff can say "set 142" instead
 * of reading out a cuid. Derived from the highest existing number rather than
 * a counter row, which keeps it correct after imports and deletions.
 */
async function nextReference(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<string> {
  const latest = await tx.tireSet.findFirst({
    where: { organizationId, reference: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { reference: true },
  })
  const parsed = Number(latest?.reference)
  const next = Number.isFinite(parsed) && parsed > 0 ? parsed + 1 : 1
  return String(next)
}

function measurementRows(measurements: MeasurementInput[] | undefined, userId: string) {
  if (!measurements?.length) return undefined
  return measurements.map((m) => ({
    position: m.position,
    treadDepthMm: m.treadDepthMm ?? null,
    pressureBar: m.pressureBar ?? null,
    condition: m.condition,
    damage: m.damage || null,
    notes: m.notes || null,
    measuredById: userId,
  }))
}

/**
 * Confirms a location can take `quantity` more tires. Runs inside the same
 * transaction as the write so two technicians checking in at once cannot both
 * pass the check and overfill the shelf.
 */
async function assertRoom(
  tx: Prisma.TransactionClient,
  locationId: string,
  organizationId: string,
  quantity: number,
  ignoreTireSetId?: string
) {
  const location = await tx.tireLocation.findFirst({
    where: { id: locationId, organizationId, isArchived: false },
    include: {
      tireSets: {
        where: {
          status: 'stored',
          ...(ignoreTireSetId ? { NOT: { id: ignoreTireSetId } } : {}),
        },
        select: { quantity: true },
      },
    },
  })
  if (!location) throw new Error('Storage location not found')

  const used = location.tireSets.reduce((sum, s) => sum + s.quantity, 0)
  const free = location.capacity - used
  if (free < quantity) {
    throw new Error(
      `${location.code} has room for ${Math.max(0, free)} more tire(s), but this set has ${quantity}.`
    )
  }
  return location
}

export async function getTireSetsPaginated(params: {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  season?: string
  warehouseId?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const page = params.page || 1
      const pageSize = params.pageSize || 20
      const skip = (page - 1) * pageSize
      const mode = 'insensitive' as Prisma.QueryMode

      const where: Prisma.TireSetWhereInput = { organizationId }

      if (params.status && params.status !== 'all') where.status = params.status
      if (params.season && params.season !== 'all') where.season = params.season
      if (params.warehouseId) where.location = { warehouseId: params.warehouseId }

      if (params.search) {
        const q = params.search.trim()
        where.OR = [
          { reference: { contains: q, mode } },
          { brand: { contains: q, mode } },
          { model: { contains: q, mode } },
          { size: { contains: q, mode } },
          { dotCode: { contains: q, mode } },
          { location: { code: { contains: q, mode } } },
          { customer: { name: { contains: q, mode } } },
          { vehicle: { licensePlate: { contains: q, mode } } },
          { vehicle: { make: { contains: q, mode } } },
          { vehicle: { model: { contains: q, mode } } },
        ]
      }

      const dir = params.sortOrder || 'desc'
      const orderBy: Prisma.TireSetOrderByWithRelationInput = (() => {
        switch (params.sortBy) {
          case 'reference':
            return { reference: dir }
          case 'season':
            return { season: dir }
          case 'status':
            return { status: dir }
          case 'checkedInAt':
            return { checkedInAt: dir }
          case 'customer':
            return { customer: { name: dir } }
          default:
            return { updatedAt: dir }
        }
      })()

      const [records, total, statusGroups] = await Promise.all([
        db.tireSet.findMany({
          where,
          orderBy,
          skip,
          take: pageSize,
          include: {
            location: {
              select: { id: true, code: true, warehouse: { select: { id: true, name: true } } },
            },
            vehicle: {
              select: { id: true, make: true, model: true, year: true, licensePlate: true },
            },
            customer: { select: { id: true, name: true, phone: true } },
            measurements: {
              orderBy: { measuredAt: 'desc' },
              take: 8,
              select: { condition: true, treadDepthMm: true, position: true, measuredAt: true },
            },
          },
        }),
        db.tireSet.count({ where }),
        db.tireSet.groupBy({
          by: ['status'],
          where: { organizationId },
          _count: { _all: true },
        }),
      ])

      const statusCounts: Record<string, number> = {}
      for (const group of statusGroups) statusCounts[group.status] = group._count._all

      return {
        records,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        statusCounts,
      }
    },
    { requiredPermissions: READ }
  )
}

export async function getTireSet(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const set = await db.tireSet.findFirst({
        where: { id, organizationId },
        include: {
          location: {
            select: {
              id: true,
              code: true,
              capacity: true,
              warehouse: { select: { id: true, name: true } },
            },
          },
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              licensePlate: true,
              vin: true,
            },
          },
          customer: { select: { id: true, name: true, phone: true, email: true } },
          measurements: {
            orderBy: { measuredAt: 'desc' },
            include: {
              measuredBy: { select: { id: true, name: true } },
              images: { orderBy: { sortOrder: 'asc' } },
            },
          },
          movements: {
            orderBy: { createdAt: 'desc' },
            include: { performedBy: { select: { id: true, name: true } } },
          },
        },
      })
      if (!set) throw new Error('Tire set not found')
      return set
    },
    { requiredPermissions: READ }
  )
}

/**
 * Arrival. Creates the set, records the intake measurements, logs the
 * movement and claims shelf space — all in one transaction, because a set
 * that exists without a location or without its arrival logged is a set
 * nobody can find later.
 */
export async function checkInTireSet(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireTireHotel(organizationId)
      const data = checkInSchema.parse(input)

      const created = await db.$transaction(async (tx) => {
        const location = await assertRoom(tx, data.locationId, organizationId, data.quantity)

        if (data.vehicleId) {
          const vehicle = await tx.vehicle.findFirst({
            where: { id: data.vehicleId, organizationId },
            select: { id: true, customerId: true },
          })
          if (!vehicle) throw new Error('Vehicle not found')
          // Fall back to the vehicle's owner so the set is always reachable
          // from the customer side, even when staff skipped that field.
          if (!data.customerId && vehicle.customerId) data.customerId = vehicle.customerId
        }

        const reference = await nextReference(tx, organizationId)
        const now = new Date()

        const set = await tx.tireSet.create({
          data: {
            reference,
            season: data.season,
            studded: data.studded ?? false,
            brand: data.brand || null,
            model: data.model || null,
            size: data.size || null,
            dotCode: data.dotCode || null,
            loadSpeedIndex: data.loadSpeedIndex || null,
            withRims: data.withRims ?? false,
            rimType: data.rimType || null,
            hasTpms: data.hasTpms ?? false,
            quantity: data.quantity,
            status: 'stored',
            notes: data.notes || null,
            locationId: location.id,
            vehicleId: data.vehicleId || null,
            customerId: data.customerId || null,
            organizationId,
            userId,
            checkedInAt: now,
          },
        })

        const movement = await tx.tireMovement.create({
          data: {
            type: 'check_in',
            toLocationId: location.id,
            toCode: location.code,
            note: data.note || null,
            tireSetId: set.id,
            organizationId,
            performedById: userId,
          },
        })

        const rows = measurementRows(data.measurements, userId)
        if (rows) {
          await tx.tireMeasurement.createMany({
            data: rows.map((row) => ({ ...row, tireSetId: set.id, movementId: movement.id })),
          })
        }

        return { ...set, locationCode: location.code }
      })

      revalidateTireHotel()
      return created
    },
    {
      requiredPermissions: CREATE,
      audit: ({ result }) => ({
        action: 'tire_set.check_in',
        message: `Checked in tire set ${result.reference} to ${result.locationCode}`,
        metadata: { tireSetId: result.id, quantity: result.quantity },
      }),
    }
  )
}

/** Departure. Frees the shelf and records the condition the tires left in. */
export async function checkOutTireSet(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireTireHotel(organizationId)
      const data = checkOutSchema.parse(input)

      const updated = await db.$transaction(async (tx) => {
        const set = await tx.tireSet.findFirst({
          where: { id: data.id, organizationId },
          include: { location: { select: { id: true, code: true } } },
        })
        if (!set) throw new Error('Tire set not found')
        if (set.status !== 'stored') throw new Error('This set is not currently in storage')

        const movement = await tx.tireMovement.create({
          data: {
            type: 'check_out',
            fromLocationId: set.location?.id ?? null,
            fromCode: set.location?.code ?? null,
            note: data.note || null,
            tireSetId: set.id,
            organizationId,
            performedById: userId,
          },
        })

        const rows = measurementRows(data.measurements, userId)
        if (rows) {
          await tx.tireMeasurement.createMany({
            data: rows.map((row) => ({ ...row, tireSetId: set.id, movementId: movement.id })),
          })
        }

        return tx.tireSet.update({
          where: { id: set.id },
          data: { status: 'released', locationId: null, checkedOutAt: new Date() },
        })
      })

      revalidateTireHotel()
      return updated
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_set.check_out',
        message: `Checked out tire set ${result.reference}`,
        metadata: { tireSetId: result.id },
      }),
    }
  )
}

/** Moving a set between shelves, e.g. when consolidating a rack. */
export async function relocateTireSet(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireTireHotel(organizationId)
      const data = relocateSchema.parse(input)

      const updated = await db.$transaction(async (tx) => {
        const set = await tx.tireSet.findFirst({
          where: { id: data.id, organizationId },
          include: { location: { select: { id: true, code: true } } },
        })
        if (!set) throw new Error('Tire set not found')
        if (set.status !== 'stored') throw new Error('This set is not currently in storage')
        if (set.locationId === data.toLocationId) throw new Error('The set is already there')

        const target = await assertRoom(tx, data.toLocationId, organizationId, set.quantity, set.id)

        await tx.tireMovement.create({
          data: {
            type: 'relocate',
            fromLocationId: set.location?.id ?? null,
            fromCode: set.location?.code ?? null,
            toLocationId: target.id,
            toCode: target.code,
            note: data.note || null,
            tireSetId: set.id,
            organizationId,
            performedById: userId,
          },
        })

        const moved = await tx.tireSet.update({
          where: { id: set.id },
          data: { locationId: target.id },
        })
        return { ...moved, fromCode: set.location?.code ?? null, toCode: target.code }
      })

      revalidateTireHotel()
      return updated
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_set.relocate',
        message: `Moved tire set ${result.reference} from ${result.fromCode ?? 'unassigned'} to ${result.toCode}`,
        metadata: { tireSetId: result.id },
      }),
    }
  )
}

export async function updateTireSet(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)
      const { id, measurements: _measurements, ...data } = updateTireSetSchema.parse(input)

      const updated = await db.$transaction(async (tx) => {
        const set = await tx.tireSet.findFirst({ where: { id, organizationId } })
        if (!set) throw new Error('Tire set not found')

        // Growing the set has to fit where it already sits.
        if (data.quantity !== undefined && data.quantity > set.quantity && set.locationId) {
          await assertRoom(tx, set.locationId, organizationId, data.quantity - set.quantity, set.id)
        }

        return tx.tireSet.update({
          where: { id },
          data: {
            ...(data.season !== undefined ? { season: data.season } : {}),
            ...(data.studded !== undefined ? { studded: data.studded } : {}),
            ...(data.brand !== undefined ? { brand: data.brand || null } : {}),
            ...(data.model !== undefined ? { model: data.model || null } : {}),
            ...(data.size !== undefined ? { size: data.size || null } : {}),
            ...(data.dotCode !== undefined ? { dotCode: data.dotCode || null } : {}),
            ...(data.loadSpeedIndex !== undefined
              ? { loadSpeedIndex: data.loadSpeedIndex || null }
              : {}),
            ...(data.withRims !== undefined ? { withRims: data.withRims } : {}),
            ...(data.rimType !== undefined ? { rimType: data.rimType || null } : {}),
            ...(data.hasTpms !== undefined ? { hasTpms: data.hasTpms } : {}),
            ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
            ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
            ...(data.status !== undefined ? { status: data.status } : {}),
            ...(data.vehicleId !== undefined ? { vehicleId: data.vehicleId || null } : {}),
            ...(data.customerId !== undefined ? { customerId: data.customerId || null } : {}),
          },
        })
      })

      revalidateTireHotel()
      return updated
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_set.update',
        message: `Updated tire set ${result.reference}`,
        metadata: { tireSetId: result.id },
      }),
    }
  )
}

/** Adds a measurement round outside check-in or check-out. */
export async function addMeasurements(input: { tireSetId: string; measurements: unknown }) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireTireHotel(organizationId)

      const set = await db.tireSet.findFirst({
        where: { id: input.tireSetId, organizationId },
        select: { id: true, reference: true },
      })
      if (!set) throw new Error('Tire set not found')

      const { measurementSchema } = await import('../Schema/tireHotelSchema')
      const parsed = measurementSchema.array().max(20).parse(input.measurements)
      const rows = measurementRows(parsed, userId)
      if (!rows?.length) throw new Error('Nothing to record')

      await db.tireMeasurement.createMany({
        data: rows.map((row) => ({ ...row, tireSetId: set.id })),
      })

      revalidateTireHotel()
      return { id: set.id, reference: set.reference, count: rows.length }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_measurement.create',
        message: `Recorded ${result.count} tire measurement(s) on set ${result.reference}`,
        metadata: { tireSetId: result.id },
      }),
    }
  )
}

export async function deleteTireSet(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const set = await db.tireSet.findFirst({
        where: { id, organizationId },
        select: { id: true, reference: true, status: true },
      })
      if (!set) throw new Error('Tire set not found')
      if (set.status === 'stored') {
        throw new Error('Check the set out before deleting it, so the shelf count stays right')
      }

      await db.tireSet.delete({ where: { id } })
      revalidateTireHotel()
      return { reference: set.reference }
    },
    {
      requiredPermissions: DELETE,
      audit: ({ result }) => ({
        action: 'tire_set.delete',
        message: `Deleted tire set ${result.reference}`,
      }),
    }
  )
}
