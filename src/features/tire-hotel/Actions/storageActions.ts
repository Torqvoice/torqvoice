'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import {
  bulkLocationSchema,
  locationSchema,
  updateLocationSchema,
  updateWarehouseSchema,
  warehouseSchema,
} from '../Schema/tireHotelSchema'
import { buildLocationCode } from '../Lib/tireConstants'
import { locationCapacity, warehouseCapacity } from '../Lib/capacity'
import { requireTireHotel, getTireHotelSettings } from '../Lib/tireHotelSettings'

const READ = [{ action: PermissionAction.READ, subject: PermissionSubject.TIRE_HOTEL }]
const MANAGE = [{ action: PermissionAction.MANAGE, subject: PermissionSubject.TIRE_HOTEL }]

function revalidateStorage() {
  revalidatePath('/tire-hotel')
  revalidatePath('/tire-hotel/storage')
}

/**
 * The shelf overview: every warehouse with its locations, each carrying how
 * many tires sit on it and how many more fit. This is the one query the
 * storage page, the location picker and the dashboard card all read from.
 */
export async function getStorageOverview() {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const warehouses = await db.tireWarehouse.findMany({
        where: { organizationId, isArchived: false },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        include: {
          locations: {
            where: { isArchived: false },
            orderBy: [{ zone: 'asc' }, { rack: 'asc' }, { shelf: 'asc' }, { code: 'asc' }],
            include: {
              tireSets: {
                where: { status: 'stored' },
                select: { quantity: true },
              },
            },
          },
        },
      })

      return warehouses.map((warehouse) => ({
        id: warehouse.id,
        name: warehouse.name,
        address: warehouse.address,
        notes: warehouse.notes,
        isDefault: warehouse.isDefault,
        summary: warehouseCapacity(warehouse),
        locations: warehouse.locations.map((location) => ({
          zone: location.zone,
          rack: location.rack,
          shelf: location.shelf,
          position: location.position,
          notes: location.notes,
          ...locationCapacity(location),
        })),
      }))
    },
    { requiredPermissions: READ }
  )
}

/**
 * Flat list of locations with free space, for the check-in location picker.
 * Returns every location rather than only the ones that fit, so the picker
 * can grey out the full shelves instead of hiding them. A technician looking
 * for shelf B-04 should see it, and see why it is unavailable.
 */
export async function getLocationOptions() {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const locations = await db.tireLocation.findMany({
        where: { organizationId, isArchived: false, warehouse: { isArchived: false } },
        orderBy: [{ warehouse: { name: 'asc' } }, { code: 'asc' }],
        include: {
          warehouse: { select: { id: true, name: true, isDefault: true } },
          tireSets: { where: { status: 'stored' }, select: { quantity: true } },
        },
      })

      return locations.map((location) => ({
        ...locationCapacity(location),
        warehouseId: location.warehouse.id,
        warehouseName: location.warehouse.name,
        warehouseIsDefault: location.warehouse.isDefault,
        zone: location.zone,
        rack: location.rack,
        shelf: location.shelf,
        position: location.position,
      }))
    },
    { requiredPermissions: READ }
  )
}

export async function createWarehouse(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireTireHotel(organizationId)
      const data = warehouseSchema.parse(input)

      // First warehouse is the default, so a single-site workshop never has to
      // think about the concept at all.
      const existing = await db.tireWarehouse.count({
        where: { organizationId, isArchived: false },
      })
      const isDefault = data.isDefault ?? existing === 0

      if (isDefault) {
        await db.tireWarehouse.updateMany({
          where: { organizationId, isDefault: true },
          data: { isDefault: false },
        })
      }

      const warehouse = await db.tireWarehouse.create({
        data: {
          name: data.name,
          address: data.address || null,
          notes: data.notes || null,
          isDefault,
          organizationId,
          userId,
        },
      })

      revalidateStorage()
      return warehouse
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'tire_warehouse.create',
        message: `Created tire warehouse ${result.name}`,
        metadata: { warehouseId: result.id },
      }),
    }
  )
}

export async function updateWarehouse(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)
      const { id, ...data } = updateWarehouseSchema.parse(input)

      const existing = await db.tireWarehouse.findFirst({ where: { id, organizationId } })
      if (!existing) throw new Error('Warehouse not found')

      if (data.isDefault) {
        await db.tireWarehouse.updateMany({
          where: { organizationId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        })
      }

      const warehouse = await db.tireWarehouse.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.address !== undefined ? { address: data.address || null } : {}),
          ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
          ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
        },
      })

      revalidateStorage()
      return warehouse
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'tire_warehouse.update',
        message: `Updated tire warehouse ${result.name}`,
        metadata: { warehouseId: result.id },
      }),
    }
  )
}

/**
 * Archives rather than deletes when tires are still stored, so history and
 * the physical reality stay in agreement. An empty warehouse is deleted
 * outright, since there is nothing to preserve.
 */
export async function deleteWarehouse(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const warehouse = await db.tireWarehouse.findFirst({
        where: { id, organizationId },
        include: {
          locations: {
            include: { tireSets: { where: { status: 'stored' }, select: { id: true } } },
          },
        },
      })
      if (!warehouse) throw new Error('Warehouse not found')

      const storedCount = warehouse.locations.reduce((sum, l) => sum + l.tireSets.length, 0)

      if (storedCount > 0) {
        await db.tireWarehouse.update({ where: { id }, data: { isArchived: true } })
        revalidateStorage()
        return { archived: true, name: warehouse.name, storedCount }
      }

      await db.tireWarehouse.delete({ where: { id } })
      revalidateStorage()
      return { archived: false, name: warehouse.name, storedCount: 0 }
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: result.archived ? 'tire_warehouse.archive' : 'tire_warehouse.delete',
        message: `${result.archived ? 'Archived' : 'Deleted'} tire warehouse ${result.name}`,
      }),
    }
  )
}

export async function createLocation(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)
      const data = locationSchema.parse(input)

      const warehouse = await db.tireWarehouse.findFirst({
        where: { id: data.warehouseId, organizationId },
        select: { id: true },
      })
      if (!warehouse) throw new Error('Warehouse not found')

      const code =
        data.code?.trim() ||
        buildLocationCode({
          zone: data.zone,
          rack: data.rack,
          shelf: data.shelf,
          position: data.position,
        })

      const clash = await db.tireLocation.findUnique({
        where: { warehouseId_code: { warehouseId: data.warehouseId, code } },
        select: { id: true },
      })
      if (clash) throw new Error(`A location called ${code} already exists in this warehouse`)

      const location = await db.tireLocation.create({
        data: {
          code,
          zone: data.zone || null,
          rack: data.rack || null,
          shelf: data.shelf || null,
          position: data.position || null,
          capacity: data.capacity,
          notes: data.notes || null,
          warehouseId: data.warehouseId,
          organizationId,
        },
      })

      revalidateStorage()
      return location
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'tire_location.create',
        message: `Created tire storage location ${result.code}`,
        metadata: { locationId: result.id },
      }),
    }
  )
}

/**
 * Creates a numbered run of shelves in one go. Setting up a warehouse shelf
 * by shelf is the slowest part of adopting the module, and a rack is almost
 * always a contiguous range.
 */
export async function createLocationsBulk(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)
      const data = bulkLocationSchema.parse(input)

      const warehouse = await db.tireWarehouse.findFirst({
        where: { id: data.warehouseId, organizationId },
        select: { id: true },
      })
      if (!warehouse) throw new Error('Warehouse not found')

      const existing = await db.tireLocation.findMany({
        where: { warehouseId: data.warehouseId },
        select: { code: true },
      })
      const taken = new Set(existing.map((l) => l.code))

      const rows: {
        code: string
        zone: string | null
        rack: string | null
        shelf: string
        capacity: number
        warehouseId: string
        organizationId: string
      }[] = []
      const skipped: string[] = []

      for (let shelf = data.shelfFrom; shelf <= data.shelfTo; shelf++) {
        const shelfLabel = String(shelf)
        const code = buildLocationCode({ zone: data.zone, rack: data.rack, shelf: shelfLabel })
        if (!code || taken.has(code)) {
          if (code) skipped.push(code)
          continue
        }
        taken.add(code)
        rows.push({
          code,
          zone: data.zone || null,
          rack: data.rack || null,
          shelf: shelfLabel,
          capacity: data.capacity,
          warehouseId: data.warehouseId,
          organizationId,
        })
      }

      if (rows.length > 0) {
        await db.tireLocation.createMany({ data: rows })
      }

      revalidateStorage()
      return { created: rows.length, skipped }
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'tire_location.bulk_create',
        message: `Created ${result.created} tire storage locations`,
        metadata: { skipped: result.skipped },
      }),
    }
  )
}

export async function updateLocation(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)
      const { id, ...data } = updateLocationSchema.parse(input)

      const existing = await db.tireLocation.findFirst({
        where: { id, organizationId },
        include: { tireSets: { where: { status: 'stored' }, select: { quantity: true } } },
      })
      if (!existing) throw new Error('Location not found')

      // Shrinking a shelf below what is already on it would make the overview
      // lie, so the operator has to move tires off first.
      if (data.capacity !== undefined) {
        const used = existing.tireSets.reduce((sum, s) => sum + s.quantity, 0)
        if (data.capacity < used) {
          throw new Error(
            `This location already holds ${used} tires. Move some off before lowering the capacity to ${data.capacity}.`
          )
        }
      }

      const nextCode =
        data.code?.trim() ||
        buildLocationCode({
          zone: data.zone ?? existing.zone,
          rack: data.rack ?? existing.rack,
          shelf: data.shelf ?? existing.shelf,
          position: data.position ?? existing.position,
        }) ||
        existing.code

      if (nextCode !== existing.code) {
        const clash = await db.tireLocation.findUnique({
          where: { warehouseId_code: { warehouseId: existing.warehouseId, code: nextCode } },
          select: { id: true },
        })
        if (clash) throw new Error(`A location called ${nextCode} already exists in this warehouse`)
      }

      const location = await db.tireLocation.update({
        where: { id },
        data: {
          code: nextCode,
          ...(data.zone !== undefined ? { zone: data.zone || null } : {}),
          ...(data.rack !== undefined ? { rack: data.rack || null } : {}),
          ...(data.shelf !== undefined ? { shelf: data.shelf || null } : {}),
          ...(data.position !== undefined ? { position: data.position || null } : {}),
          ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
          ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
          ...(data.isArchived !== undefined ? { isArchived: data.isArchived } : {}),
        },
      })

      revalidateStorage()
      return location
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'tire_location.update',
        message: `Updated tire storage location ${result.code}`,
        metadata: { locationId: result.id },
      }),
    }
  )
}

export async function deleteLocation(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const location = await db.tireLocation.findFirst({
        where: { id, organizationId },
        include: { tireSets: { where: { status: 'stored' }, select: { id: true } } },
      })
      if (!location) throw new Error('Location not found')

      if (location.tireSets.length > 0) {
        throw new Error(
          `${location.code} still holds ${location.tireSets.length} tire set(s). Move or check them out first.`
        )
      }

      await db.tireLocation.delete({ where: { id } })
      revalidateStorage()
      return { code: location.code }
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'tire_location.delete',
        message: `Deleted tire storage location ${result.code}`,
      }),
    }
  )
}

/** Settings the client needs to render units and capacity hints. */
export async function getTireHotelConfig() {
  return withAuth(async ({ organizationId }) => getTireHotelSettings(organizationId), {
    requiredPermissions: READ,
  })
}
