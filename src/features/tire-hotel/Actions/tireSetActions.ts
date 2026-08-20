'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import {
  checkInSchema,
  checkOutSchema,
  disposeSetSchema,
  relocateSchema,
  returnSetSchema,
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

      // "needs_prep" is not a set status but a question about its work list, so
      // it filters on outstanding treatments and leaves the status alone.
      if (params.status === 'needs_prep') {
        where.treatments = { some: { status: 'pending' } }
        where.status = { not: 'disposed' }
      } else if (params.status && params.status !== 'all') {
        where.status = params.status
      } else {
        // A written-off set is history. After a few years a shop would have
        // more scrapped sets than live ones, and the default view is meant to
        // answer what is here now.
        where.status = { not: 'disposed' }
      }
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

      const [records, total, statusGroups, needsPrepCount] = await Promise.all([
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
            treatments: { select: { type: true, status: true } },
          },
        }),
        db.tireSet.count({ where }),
        db.tireSet.groupBy({
          by: ['status'],
          where: { organizationId },
          _count: { _all: true },
        }),
        db.tireSet.count({
          // Matches the filter itself: a written-off set is not outstanding
          // work, so the badge must not count it either.
          where: {
            organizationId,
            status: { not: 'disposed' },
            treatments: { some: { status: 'pending' } },
          },
        }),
      ])

      const statusCounts: Record<string, number> = {}
      for (const group of statusGroups) statusCounts[group.status] = group._count._all
      statusCounts.needs_prep = needsPrepCount

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
          treatments: {
            orderBy: { createdAt: 'asc' },
            include: { completedBy: { select: { id: true, name: true } } },
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
 * movement and claims shelf space, all in one transaction, because a set
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

        if (data.treatments?.length) {
          await tx.tireTreatment.createMany({
            data: data.treatments.map((type) => ({
              type,
              status: 'pending',
              tireSetId: set.id,
              organizationId,
            })),
            skipDuplicates: true,
          })
        }

        // Started from a work order, so that job is what these tires came in
        // on. Only claimed when the job is not already about another set, so
        // storing a second set never quietly rewrites the first one's link.
        if (data.serviceRecordId) {
          const record = await tx.serviceRecord.findFirst({
            where: { id: data.serviceRecordId, organizationId },
            select: { id: true, tireSetId: true },
          })
          if (record && !record.tireSetId) {
            await tx.serviceRecord.update({
              where: { id: record.id },
              data: { tireSetId: set.id },
            })
          }
        }

        return { ...set, locationCode: location.code }
      })

      revalidateTireHotel()
      if (data.serviceRecordId) revalidatePath(`/vehicles/${created.vehicleId}`)
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

/**
 * Every set the shop still holds a live record of, with its tread history.
 *
 * Feeds the replacement forecast. Disposed sets are excluded because they are
 * in a skip, and their last reading would otherwise be counted as demand that
 * has already been met.
 */
export async function getSetsForForecast() {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      return db.tireSet.findMany({
        where: { organizationId, status: { not: 'disposed' } },
        orderBy: { checkedInAt: 'desc' },
        take: 500,
        select: {
          id: true,
          reference: true,
          season: true,
          size: true,
          brand: true,
          quantity: true,
          status: true,
          customer: { select: { id: true, name: true } },
          vehicle: { select: { id: true, licensePlate: true, make: true, model: true } },
          measurements: {
            orderBy: { measuredAt: 'desc' },
            take: 24,
            select: {
              position: true,
              treadDepthMm: true,
              condition: true,
              measuredAt: true,
              movementId: true,
            },
          },
        },
      })
    },
    { requiredPermissions: READ }
  )
}

/**
 * Sets this customer has left with, which could be coming back.
 *
 * A tire hotel's ordinary year is the same four tires arriving twice: the
 * winter set in spring, the summer set in autumn. Typing them in again each
 * time produces a second record of the same physical tires, which loses the
 * one thing the shop is uniquely able to tell the customer, how fast they are
 * actually wearing.
 *
 * Disposed sets never appear. They were scrapped or replaced, and offering
 * them is how a new set ends up filed under the old one's history.
 */
export async function getReturningSets(input: {
  customerId?: string | null
  vehicleId?: string | null
}) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const { customerId, vehicleId } = input
      if (!customerId && !vehicleId) return []

      return db.tireSet.findMany({
        where: {
          organizationId,
          status: 'released',
          OR: [...(vehicleId ? [{ vehicleId }] : []), ...(customerId ? [{ customerId }] : [])],
        },
        orderBy: { checkedOutAt: 'desc' },
        take: 12,
        select: {
          id: true,
          reference: true,
          season: true,
          studded: true,
          brand: true,
          model: true,
          size: true,
          quantity: true,
          withRims: true,
          hasTpms: true,
          checkedOutAt: true,
          vehicleId: true,
          customerId: true,
          vehicle: { select: { make: true, model: true, year: true, licensePlate: true } },
          measurements: {
            orderBy: { measuredAt: 'desc' },
            take: 8,
            select: {
              position: true,
              treadDepthMm: true,
              condition: true,
              measuredAt: true,
              movementId: true,
            },
          },
        },
      })
    },
    { requiredPermissions: READ }
  )
}

/**
 * The same tires, back on a shelf for another season.
 *
 * Reuses the record rather than creating a second one, because it is the same
 * rubber: the measurements, the movements and the wear all belong to one
 * history. A new record every season would make the shop's best answer to
 * "how long have these got left" impossible to give.
 */
export async function returnTireSet(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireTireHotel(organizationId)
      const data = returnSetSchema.parse(input)

      const returned = await db.$transaction(async (tx) => {
        const set = await tx.tireSet.findFirst({
          where: { id: data.id, organizationId },
          select: { id: true, reference: true, status: true, quantity: true, vehicleId: true },
        })
        if (!set) throw new Error('Tire set not found')
        if (set.status === 'stored') throw new Error('This set is already in storage')
        if (set.status === 'disposed') {
          throw new Error('This set was written off and cannot be stored again')
        }

        const quantity = data.quantity ?? set.quantity
        const location = await assertRoom(tx, data.locationId, organizationId, quantity)

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

        if (data.treatments?.length) {
          // A wash asked for this season is a new request, even if the same
          // work was finished last season. One row per kind of work per set is
          // the model, so the settled row is reopened rather than duplicated.
          await tx.tireTreatment.updateMany({
            where: { tireSetId: set.id, type: { in: data.treatments } },
            data: { status: 'pending', completedAt: null, completedById: null },
          })
          await tx.tireTreatment.createMany({
            data: data.treatments.map((type) => ({
              type,
              status: 'pending',
              tireSetId: set.id,
              organizationId,
            })),
            skipDuplicates: true,
          })
        }

        if (data.serviceRecordId) {
          const record = await tx.serviceRecord.findFirst({
            where: { id: data.serviceRecordId, organizationId },
            select: { id: true, tireSetId: true },
          })
          if (record && !record.tireSetId) {
            await tx.serviceRecord.update({
              where: { id: record.id },
              data: { tireSetId: set.id },
            })
          }
        }

        const updated = await tx.tireSet.update({
          where: { id: set.id },
          data: {
            status: 'stored',
            locationId: location.id,
            quantity,
            checkedInAt: new Date(),
            checkedOutAt: null,
          },
        })

        return { ...updated, locationCode: location.code }
      })

      revalidateTireHotel()
      if (returned.vehicleId) revalidatePath(`/vehicles/${returned.vehicleId}`)
      return returned
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_set.return',
        message: `Stored tire set ${result.reference} again, on ${result.locationCode}`,
        metadata: { tireSetId: result.id, quantity: result.quantity },
      }),
    }
  )
}

/**
 * Writes a set off: scrapped, sold, or replaced by new tires.
 *
 * Kept rather than deleted, because the history is worth having and an
 * invoice may point at it. What changes is that it stops being offered as
 * "the same tires again" next season, which is the whole point: a customer
 * who bought new tires should not have last year's set suggested back to
 * them, with last year's wear attached to it.
 */
export async function disposeTireSet(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireTireHotel(organizationId)
      const data = disposeSetSchema.parse(input)

      const disposed = await db.$transaction(async (tx) => {
        const set = await tx.tireSet.findFirst({
          where: { id: data.id, organizationId },
          include: { location: { select: { id: true, code: true } } },
        })
        if (!set) throw new Error('Tire set not found')
        if (set.status === 'disposed') throw new Error('This set is already written off')

        await tx.tireMovement.create({
          data: {
            type: 'dispose',
            // Freeing a shelf is worth recording as coming off it, so the
            // rack history still explains where the space went.
            fromLocationId: set.location?.id ?? null,
            fromCode: set.location?.code ?? null,
            note: data.note || null,
            tireSetId: set.id,
            organizationId,
            performedById: userId,
          },
        })

        return tx.tireSet.update({
          where: { id: set.id },
          data: {
            status: 'disposed',
            locationId: null,
            checkedOutAt: set.checkedOutAt ?? new Date(),
          },
        })
      })

      revalidateTireHotel()
      if (disposed.vehicleId) revalidatePath(`/vehicles/${disposed.vehicleId}`)
      return disposed
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_set.dispose',
        message: `Wrote off tire set ${result.reference}`,
        metadata: { tireSetId: result.id },
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
