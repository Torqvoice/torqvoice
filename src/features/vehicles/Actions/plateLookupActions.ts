'use server'

import { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { recordRegistryAnswer } from '@/features/integrations/Lib/inspection-sync'
import type { VehicleLookupResult } from '@/features/integrations/Lib/types'
import {
  askRegistry,
  findLookupConnection,
  withinLookupBudget,
} from '@/features/integrations/Lib/vehicle-lookup'
import { compactPlate, looksLikePlate } from '../Lib/plate'

/**
 * The header's plate lookup: one plate, two answers. What the workshop
 * already knows about the vehicle, and what the connected registry says,
 * asked together so the person at the desk sees both at once.
 */

const READ_VEHICLES = [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }]

/** A vehicle of this workshop, as much as the palette shows of it. */
export interface WorkshopVehicle {
  id: string
  make: string
  model: string
  year: number
  licensePlate: string | null
  vin: string | null
  color: string | null
  mileage: number
  imageUrl: string | null
  isArchived: boolean
  customer: { id: string; name: string; company: string | null; phone: string | null } | null
  inspectionDueAt: string | null
  serviceCount: number
  lastServiceAt: string | null
}

export interface PlateLookup {
  /** The plate as it was searched, compacted. */
  plate: string
  /** The workshop's own vehicle with this plate (or the registry's VIN), when there is one. */
  vehicle: WorkshopVehicle | null
  /** What the registry said, null when it has no such vehicle. */
  registry: (VehicleLookupResult & { source: string }) | null
  /** Set when the registry could not be asked; the workshop half still stands. */
  registryError: string | null
  /** Registry name, for the empty state's attribution. */
  source: string | null
}

const VEHICLE_SELECT = {
  id: true,
  make: true,
  model: true,
  year: true,
  licensePlate: true,
  vin: true,
  color: true,
  mileage: true,
  imageUrl: true,
  isArchived: true,
  customer: { select: { id: true, name: true, company: true, phone: true } },
  inspectionStatus: { select: { dueAt: true } },
  _count: { select: { serviceRecords: true } },
  serviceRecords: {
    select: { serviceDate: true },
    orderBy: { serviceDate: 'desc' as const },
    take: 1,
  },
} satisfies Prisma.VehicleSelect

type VehicleRow = Prisma.VehicleGetPayload<{ select: typeof VEHICLE_SELECT }>

function toWorkshopVehicle(row: VehicleRow): WorkshopVehicle {
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    year: row.year,
    licensePlate: row.licensePlate,
    vin: row.vin,
    color: row.color,
    mileage: row.mileage,
    imageUrl: row.imageUrl,
    isArchived: row.isArchived,
    customer: row.customer,
    inspectionDueAt: row.inspectionStatus?.dueAt?.toISOString() ?? null,
    serviceCount: row._count.serviceRecords,
    lastServiceAt: row.serviceRecords[0]?.serviceDate?.toISOString() ?? null,
  }
}

/**
 * The workshop's vehicle with this plate. Plates are stored the way people
 * typed them, with or without hyphens and spaces, so the comparison strips
 * both sides down to letters and digits in the database. An active vehicle
 * wins over an archived one with the same plate.
 */
async function findByPlate(organizationId: string, compact: string): Promise<VehicleRow | null> {
  const ids = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM vehicles
    WHERE "organizationId" = ${organizationId}
      AND "licensePlate" IS NOT NULL
      AND regexp_replace(upper("licensePlate"), '[^A-Z0-9]', '', 'g') = ${compact}
    ORDER BY "isArchived" ASC, "updatedAt" DESC
    LIMIT 1
  `
  const id = ids[0]?.id
  if (!id) return null
  return db.vehicle.findUnique({ where: { id }, select: VEHICLE_SELECT })
}

/** The same vehicle under a new plate: the registry's VIN is already on file. */
async function findByVin(organizationId: string, vin: string): Promise<VehicleRow | null> {
  return db.vehicle.findFirst({
    where: { organizationId, vin: { equals: vin, mode: 'insensitive' } },
    orderBy: [{ isArchived: 'asc' }, { updatedAt: 'desc' }],
    select: VEHICLE_SELECT,
  })
}

export async function lookupPlate(input: { plate: string }) {
  return withAuth(
    async ({ organizationId }): Promise<PlateLookup> => {
      const typed = input.plate?.trim() ?? ''
      if (!looksLikePlate(typed)) throw new Error('That does not look like a plate')
      const plate = compactPlate(typed)

      const features = await getFeatures(organizationId)
      const target = features.integrations ? await findLookupConnection(organizationId) : null

      // The workshop's own records first, so a registry that is slow or down
      // still leaves the desk with the vehicle they were asking about.
      let vehicle = await findByPlate(organizationId, plate)

      let registry: PlateLookup['registry'] = null
      let registryError: string | null = null
      let source: string | null = null
      if (target) {
        if (!withinLookupBudget(organizationId)) {
          registryError = 'Too many lookups, wait a minute and try again'
        } else {
          try {
            const answer = await askRegistry(target.id, { plate })
            source = answer.source
            if (answer.result) registry = { ...answer.result, source: answer.source }
            if (!vehicle && answer.result?.vin) {
              vehicle = await findByVin(organizationId, answer.result.vin)
            }
            if (vehicle) {
              await recordRegistryAnswer({
                organizationId,
                vehicleId: vehicle.id,
                source: answer.connectorId,
                result: answer.result,
              })
            }
          } catch (err) {
            registryError = err instanceof Error ? err.message : 'The registry could not be asked'
          }
        }
      }

      return {
        plate,
        vehicle: vehicle ? toWorkshopVehicle(vehicle) : null,
        registry,
        registryError,
        source,
      }
    },
    { requiredPermissions: READ_VEHICLES }
  )
}
