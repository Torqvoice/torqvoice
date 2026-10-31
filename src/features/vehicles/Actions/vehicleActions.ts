'use server'

import {
  INSPECTION_CAPABILITY,
  recordRegistryAnswer,
} from '@/features/integrations/Lib/inspection-sync'
import { getManifest } from '@/integrations/registry'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { assertOwnUploads } from '@/lib/upload-url'
import { toSafeWorkshopDate } from '@/lib/workshop-datetime'
import { db } from '@/lib/db'
import { assertOwnedCustomer } from '@/lib/owned-records'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { createVehicleSchema, updateVehicleSchema } from '../Schema/vehicleSchema'
import { holdsRegistryDate, lookupAppliesTo, type RegistryLookup } from '../Lib/registryLookup'
import { revalidatePath } from 'next/cache'
import { releaseFiles } from '@/lib/files/manager'
import { vehicleFileUrls } from '@/lib/files/collect'
import { auditDetails } from '@/lib/audit'
import { searchYear } from '@/features/vehicles/Lib/searchYear'
import { searchWordsOf, typeKeySearchTerms } from '../Lib/typeKey'
import { isTypeKeyEnabled } from '../Lib/typeKeySetting'

export async function getVehicles() {
  return withAuth(
    async ({ organizationId }) => {
      return db.vehicle.findMany({
        where: { organizationId, isArchived: false },
        include: {
          customer: { select: { id: true, name: true, company: true } },
          _count: {
            select: { serviceRecords: true, notes: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      })
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}

export async function getVehicle(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
        include: {
          customer: { select: { id: true, name: true, company: true, email: true, phone: true } },
          inspectionStatus: {
            select: { dueAt: true, lastAt: true, source: true, checkedAt: true, registered: true },
          },
          serviceRecords: {
            orderBy: [{ startDateTime: { sort: 'desc', nulls: 'last' } }, { serviceDate: 'desc' }],
            take: 10,
            include: {
              _count: { select: { partItems: true, laborItems: true } },
            },
          },
          notes: { orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }] },
          reminders: {
            orderBy: [{ isCompleted: 'asc' }, { dueDate: 'asc' }],
            select: {
              id: true,
              title: true,
              description: true,
              dueDate: true,
              // Whether the time of day was chosen, and which channels were
              // asked for. Left out of this select, the tab showed every
              // reminder as day-only and its edit form opened with the time
              // blank and the channels back at their defaults, so saving an
              // 08:00 email reminder rewrote it to noon with no email.
              hasDueTime: true,
              notifyInApp: true,
              notifyEmail: true,
              dueMileage: true,
              isCompleted: true,
              createdAt: true,
            },
          },
          aiMessages: {
            select: { type: true, content: true, updatedAt: true },
          },
          _count: {
            select: {
              serviceRecords: true,
              notes: true,
              reminders: { where: { isCompleted: false } },
              findings: { where: { status: 'open' } },
            },
          },
        },
      })

      // Missing or foreign-org vehicle yields null rather than an error: the
      // page renders its not-found state, and this also runs during the
      // post-delete re-render of the vehicle route.
      return vehicle
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}

export async function getVehiclesPaginated(params: {
  page?: number
  pageSize?: number
  search?: string
  archived?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  /** Periodic inspection filter: overdue, or due within this many days. */
  inspectionDue?: 'overdue' | 30 | 90
}) {
  return withAuth(
    async ({ organizationId }) => {
      const page = params.page || 1
      const pageSize = params.pageSize || 20
      const skip = (page - 1) * pageSize

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { organizationId, isArchived: params.archived ?? false }

      if (params.search) {
        const words = searchWordsOf(params.search)
        const typeKeyOn = await isTypeKeyEnabled(organizationId)
        const fieldMatch = (word: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const conditions: any[] = [
            { make: { contains: word, mode: 'insensitive' } },
            { model: { contains: word, mode: 'insensitive' } },
            { licensePlate: { contains: word, mode: 'insensitive' } },
            { vin: { contains: word, mode: 'insensitive' } },
            ...(typeKeyOn ? typeKeySearchTerms(word) : []),
            { customer: { name: { contains: word, mode: 'insensitive' } } },
          ]
          const year = searchYear(word)
          if (year !== null) {
            conditions.push({ year })
          }
          return conditions
        }
        if (words.length > 1) {
          where.AND = words.map((word: string) => ({ OR: fieldMatch(word) }))
        } else {
          where.OR = fieldMatch(words[0])
        }
      }

      if (params.inspectionDue) {
        const now = new Date()
        where.inspectionStatus =
          params.inspectionDue === 'overdue'
            ? { dueAt: { lt: now } }
            : { dueAt: { lt: new Date(now.getTime() + params.inspectionDue * 86_400_000) } }
      }

      const [vehicles, total, archivedCount, inspectionDataCount] = await Promise.all([
        db.vehicle.findMany({
          where,
          include: {
            customer: { select: { id: true, name: true, company: true } },
            inspectionStatus: { select: { dueAt: true, source: true } },
            _count: { select: { serviceRecords: true } },
          },
          orderBy: (() => {
            const dir = params.sortOrder || 'desc'
            // A due-date filter reads soonest first unless a column was chosen.
            if (params.inspectionDue && !params.sortBy) {
              return { inspectionStatus: { dueAt: 'asc' as const } }
            }
            switch (params.sortBy) {
              case 'plate':
                return { licensePlate: { sort: dir, nulls: 'last' as const } }
              // The column shows "year make model" as one value; sort by make,
              // then model, then year so identical models group together
              case 'vehicle':
                return [{ make: dir }, { model: dir }, { year: dir }]
              case 'customer':
                return { customer: { name: dir } }
              case 'mileage':
                return { mileage: dir }
              case 'services':
                return { serviceRecords: { _count: dir } }
              default:
                return { updatedAt: 'desc' as const }
            }
          })(),
          skip,
          take: pageSize,
        }),
        db.vehicle.count({ where }),
        db.vehicle.count({ where: { organizationId, isArchived: true } }),
        db.vehicleInspectionStatus.count({ where: { organizationId, dueAt: { not: null } } }),
      ])

      return {
        vehicles,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        archivedCount,
        /** Whether any vehicle here has an inspection date, which is when the filter is worth showing. */
        hasInspectionData: inspectionDataCount > 0,
      }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}

/** A connector id that is a registry able to keep inspection dates, or null for anything else. */
function inspectionRegistry(source: string | undefined): string | null {
  if (!source) return null
  const manifest = getManifest(source)
  return manifest?.capabilities.includes(INSPECTION_CAPABILITY) ? manifest.id : null
}

/**
 * The form's inspection date and the registry lookup behind it.
 *
 * A lookup made on the form is recorded whole, the way the hourly sync
 * records its own, with the registry's day read as a UTC day and the time of
 * the check, so the sync treats the vehicle as freshly checked instead of
 * spending a second lookup on it. Only when it was about this vehicle: a
 * plate retyped after the lookup gets no answer that was never about it.
 *
 * The date field is then saved by hand only when the workshop typed
 * something other than what the registry said; a date the lookup wrote and
 * nobody touched is never saved as typed, not even when the plate was retyped
 * underneath it. A typed date is kept beside
 * the registry's answer with its own source, so a workshop in a country
 * without a registry, or one that knows better than the register, can still
 * drive reminders; a registry date takes over again on the next sync.
 */
async function saveInspectionDate(
  organizationId: string,
  vehicleId: string,
  value: string | undefined,
  lookup: RegistryLookup | undefined,
  saved: { licensePlate?: string | null; vin?: string | null }
): Promise<void> {
  if (lookup) {
    const registry = lookupAppliesTo(lookup, saved) ? inspectionRegistry(lookup.connectorId) : null
    if (registry) {
      await recordRegistryAnswer({
        organizationId,
        vehicleId,
        source: registry,
        result: lookup.result,
      })
    }
    if (holdsRegistryDate(value, lookup.result)) return
  }
  if (value === undefined) return
  const trimmed = value.trim()
  if (!trimmed) {
    // Clearing only removes a date the workshop typed; a registry date stays.
    await db.vehicleInspectionStatus.updateMany({
      where: { vehicleId, organizationId, source: 'manual' },
      data: { dueAt: null },
    })
    return
  }
  const dueAt = toSafeWorkshopDate(trimmed, await workshopTimeZone(organizationId))
  if (!dueAt) throw new Error('Invalid inspection date')
  await db.vehicleInspectionStatus.upsert({
    where: { vehicleId },
    create: { organizationId, vehicleId, dueAt, source: 'manual', found: true },
    update: { dueAt, source: 'manual', lastError: null },
  })
}

export async function createVehicle(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const { inspectionDueAt, registryLookup, ...data } = createVehicleSchema.parse(input)
      assertOwnUploads(data, organizationId)
      // The owner the vehicle is filed under must be one of our customers.
      await assertOwnedCustomer(data.customerId, organizationId)
      const timeZone = await workshopTimeZone(organizationId)
      const vehicle = await db.vehicle.create({
        data: {
          ...data,
          hsn: data.hsn || null,
          tsn: data.tsn || null,
          purchaseDate: toSafeWorkshopDate(data.purchaseDate, timeZone) ?? null,
          customerId: data.customerId || null,
          userId,
          organizationId,
        },
      })
      await saveInspectionDate(organizationId, vehicle.id, inspectionDueAt, registryLookup, vehicle)
      revalidatePath('/')
      revalidatePath('/vehicles')
      return vehicle
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.VEHICLES },
      ],
      audit: ({ result }) => ({
        action: 'vehicle.create',
        entity: 'Vehicle',
        entityId: result.id,
        details: {
          key: 'vehicle_create',
          params: { year: result.year, make: result.make, model: result.model },
        },
        metadata: { vehicleId: result.id },
      }),
    }
  )
}

export async function updateVehicle(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const { id, inspectionDueAt, registryLookup, ...data } = updateVehicleSchema.parse(input)
      assertOwnUploads(data, organizationId)

      // Fetch current record for display/diff, and the image it had
      const before = await db.vehicle.findFirst({
        where: { id, organizationId },
        select: {
          year: true,
          make: true,
          model: true,
          licensePlate: true,
          vin: true,
          imageUrl: true,
        },
      })
      if (!before) throw new Error('Vehicle not found')
      await assertOwnedCustomer(data.customerId, organizationId)

      const updateResult = await db.vehicle.updateMany({
        where: { id, organizationId },
        data: {
          ...data,
          vin: data.vin !== undefined ? data.vin || null : undefined,
          licensePlate: data.licensePlate !== undefined ? data.licensePlate || null : undefined,
          color: data.color !== undefined ? data.color || null : undefined,
          fuelType: data.fuelType !== undefined ? data.fuelType || null : undefined,
          transmission: data.transmission !== undefined ? data.transmission || null : undefined,
          engineSize: data.engineSize !== undefined ? data.engineSize || null : undefined,
          engineCode: data.engineCode !== undefined ? data.engineCode || null : undefined,
          hsn: data.hsn !== undefined ? data.hsn || null : undefined,
          tsn: data.tsn !== undefined ? data.tsn || null : undefined,
          purchaseDate: toSafeWorkshopDate(
            data.purchaseDate,
            await workshopTimeZone(organizationId)
          ),
          customerId: data.customerId !== undefined ? data.customerId || null : undefined,
        },
      })
      if (updateResult.count === 0) throw new Error('Vehicle not found')
      // A replaced image is let go once the new one is saved; the file manager
      // keeps it if anything else still shows it.
      if (data.imageUrl !== undefined && before.imageUrl && before.imageUrl !== data.imageUrl) {
        await releaseFiles([before.imageUrl], { organizationId, reason: 'vehicle image replaced' })
      }
      await saveInspectionDate(organizationId, id, inspectionDueAt, registryLookup, {
        licensePlate: data.licensePlate !== undefined ? data.licensePlate : before.licensePlate,
        vin: data.vin !== undefined ? data.vin : before.vin,
      })
      const vehicleDisplay = `${before.year} ${before.make} ${before.model}${before.licensePlate ? ` (${before.licensePlate})` : ''}`
      const changedKeys = Object.keys(data).filter(
        (k) => (data as Record<string, unknown>)[k] !== undefined
      )
      revalidatePath('/')
      revalidatePath('/vehicles')
      revalidatePath(`/vehicles/${id}`)
      return { id, count: updateResult.count, fields: changedKeys, vehicleDisplay }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
      audit: ({ result }) => ({
        action: 'vehicle.update',
        entity: 'Vehicle',
        entityId: result.id,
        details: result.fields.length
          ? auditDetails('vehicle_update', {
              name: result.vehicleDisplay,
              fields: result.fields.join(', '),
            })
          : auditDetails('vehicle_updateNoChanges', { name: result.vehicleDisplay }),
        metadata: {
          vehicleId: result.id,
          vehicleDisplay: result.vehicleDisplay,
          changed: result.fields,
        },
      }),
    }
  )
}

export async function deleteVehicle(vehicleId: string) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
        select: { year: true, make: true, model: true, licensePlate: true },
      })
      if (!vehicle) throw new Error('Vehicle not found')

      // Everything the delete cascades to, read while it still exists, and
      // let go once the rows are gone.
      const files = await vehicleFileUrls(organizationId, [vehicleId])
      await db.vehicle.deleteMany({ where: { id: vehicleId, organizationId } })
      await releaseFiles(files, { organizationId, reason: 'vehicle deleted' })

      const vehicleDisplay = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.licensePlate ? ` (${vehicle.licensePlate})` : ''}`
      revalidatePath('/')
      revalidatePath('/vehicles')
      return { vehicleId, vehicleDisplay }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.VEHICLES },
      ],
      audit: ({ result }) => ({
        action: 'vehicle.delete',
        entity: 'Vehicle',
        entityId: result.vehicleId,
        details: { key: 'vehicle_delete', params: { name: result.vehicleDisplay } },
        metadata: { vehicleId: result.vehicleId, vehicleDisplay: result.vehicleDisplay },
      }),
    }
  )
}

export async function searchVehicles(search?: string, limit = 20, offset = 0, customerId?: string) {
  return withAuth(
    async ({ organizationId }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { organizationId, isArchived: false }
      if (customerId) where.customerId = customerId
      if (search) {
        const words = searchWordsOf(search)
        const typeKeyOn = await isTypeKeyEnabled(organizationId)
        const fieldMatch = (word: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const conditions: any[] = [
            { make: { contains: word, mode: 'insensitive' } },
            { model: { contains: word, mode: 'insensitive' } },
            { licensePlate: { contains: word, mode: 'insensitive' } },
            { vin: { contains: word, mode: 'insensitive' } },
            ...(typeKeyOn ? typeKeySearchTerms(word) : []),
            { customer: { name: { contains: word, mode: 'insensitive' } } },
          ]
          const year = searchYear(word)
          if (year !== null) {
            conditions.push({ year })
          }
          return conditions
        }
        if (words.length > 1) {
          where.AND = words.map((word) => ({ OR: fieldMatch(word) }))
        } else {
          where.OR = fieldMatch(words[0])
        }
      }
      return db.vehicle.findMany({
        where,
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          customerId: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
      })
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
