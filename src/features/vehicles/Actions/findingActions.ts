'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import {
  createFindingSchema,
  updateFindingSchema,
  resolveFindingSchema,
} from '../Schema/findingSchema'
import { revalidatePath } from 'next/cache'

export async function getObservationsPaginated(params: {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  severity?: string
}) {
  return withAuth(
    async ({ organizationId }) => {
      const page = params.page || 1
      const pageSize = params.pageSize || 25
      const skip = (page - 1) * pageSize

      const search = params.search?.trim()
      // VehicleFinding has no organizationId of its own — findings are always
      // vehicle-scoped, so the org check must go through the vehicle relation.
      const where = {
        vehicle: { organizationId },
        ...(params.status && params.status !== 'all' ? { status: params.status } : {}),
        ...(params.severity && params.severity !== 'all' ? { severity: params.severity } : {}),
        ...(search
          ? {
              OR: [
                { description: { contains: search, mode: 'insensitive' as const } },
                { notes: { contains: search, mode: 'insensitive' as const } },
                { vehicle: { licensePlate: { contains: search, mode: 'insensitive' as const } } },
                { vehicle: { make: { contains: search, mode: 'insensitive' as const } } },
                { vehicle: { model: { contains: search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      }

      const [records, total] = await Promise.all([
        db.vehicleFinding.findMany({
          where,
          include: {
            vehicle: {
              select: {
                id: true,
                make: true,
                model: true,
                year: true,
                licensePlate: true,
              },
            },
            serviceRecord: { select: { id: true, title: true } },
            resolvedServiceRecord: { select: { id: true, title: true } },
          },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          skip,
          take: pageSize,
        }),
        db.vehicleFinding.count({ where }),
      ])

      return {
        records,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}

export async function getRecentObservations(limit = 10) {
  return withAuth(
    async ({ organizationId }) => {
      return db.vehicleFinding.findMany({
        where: {
          status: 'open',
          vehicle: { organizationId },
        },
        include: {
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              licensePlate: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}

export async function getServiceFindings(serviceRecordId: string) {
  return withAuth(
    async ({ organizationId }) => {
      return db.vehicleFinding.findMany({
        where: {
          serviceRecordId,
          vehicle: { organizationId },
        },
        orderBy: { createdAt: 'desc' },
      })
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}

export async function getVehicleFindings(
  vehicleId: string,
  params: { page?: number; pageSize?: number }
) {
  return withAuth(
    async ({ organizationId }) => {
      const page = params.page || 1
      const pageSize = params.pageSize || 10
      const skip = (page - 1) * pageSize

      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
      })
      // Deleted or foreign-org vehicle: empty result instead of an error, since
      // this runs during the post-delete re-render of the vehicle page.
      if (!vehicle) {
        return { records: [], total: 0, page, pageSize, totalPages: 0 }
      }

      const [records, total] = await Promise.all([
        db.vehicleFinding.findMany({
          where: { vehicleId },
          include: {
            serviceRecord: { select: { id: true, title: true } },
            resolvedServiceRecord: { select: { id: true, title: true } },
          },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          skip,
          take: pageSize,
        }),
        db.vehicleFinding.count({ where: { vehicleId } }),
      ])

      return {
        records,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}

/**
 * A concern id is only usable if it belongs to this workshop.
 *
 * Without this check the id travels straight from the client into a foreign
 * key, and a finding on one workshop's vehicle could be pointed at another
 * workshop's concern. Nothing renders it across the boundary, but it is a
 * cross-organization write, and those do not get to depend on the UI for
 * their safety.
 */
async function assertConcernInOrg(concernId: string | null | undefined, organizationId: string) {
  if (!concernId) return
  const concern = await db.serviceConcern.findFirst({
    where: { id: concernId, serviceRecord: { organizationId } },
    select: { id: true },
  })
  if (!concern) throw new Error('Concern not found')
}

export async function createFinding(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = createFindingSchema.parse(input)
      const vehicle = await db.vehicle.findFirst({
        where: { id: data.vehicleId, organizationId },
      })
      if (!vehicle) throw new Error('Vehicle not found')
      await assertConcernInOrg(data.concernId, organizationId)

      const finding = await db.vehicleFinding.create({ data })
      revalidatePath(`/vehicles/${data.vehicleId}`)
      revalidatePath('/')
      return finding
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.VEHICLES,
        },
      ],
      audit: ({ result }) => ({
        action: 'finding.create',
        entity: 'VehicleFinding',
        entityId: result.id,
        details: {
          key: 'finding_create',
          params: { description: result.description, vehicleId: result.vehicleId },
        },
        metadata: { findingId: result.id, vehicleId: result.vehicleId },
      }),
    }
  )
}

export async function updateFinding(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { id, ...data } = updateFindingSchema.parse(input)
      const finding = await db.vehicleFinding.findFirst({
        where: { id, vehicle: { organizationId } },
      })
      if (!finding) throw new Error('Finding not found')
      await assertConcernInOrg(data.concernId, organizationId)

      const updated = await db.vehicleFinding.update({
        where: { id },
        data: {
          ...data,
          notes: data.notes !== undefined ? data.notes || null : undefined,
        },
      })
      revalidatePath(`/vehicles/${finding.vehicleId}`)
      revalidatePath('/')
      return updated
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.VEHICLES,
        },
      ],
      audit: ({ result }) => ({
        action: 'finding.update',
        entity: 'VehicleFinding',
        entityId: result.id,
        details: { key: 'finding_update', params: { description: result.description } },
        metadata: { findingId: result.id, vehicleId: result.vehicleId },
      }),
    }
  )
}

export async function resolveFinding(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = resolveFindingSchema.parse(input)
      const finding = await db.vehicleFinding.findFirst({
        where: { id: data.id, vehicle: { organizationId } },
      })
      if (!finding) throw new Error('Finding not found')

      const updated = await db.vehicleFinding.update({
        where: { id: data.id },
        data: {
          status: 'resolved',
          resolvedServiceRecordId: data.resolvedServiceRecordId || null,
        },
      })
      revalidatePath(`/vehicles/${finding.vehicleId}`)
      revalidatePath('/')
      return updated
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.VEHICLES,
        },
      ],
      audit: ({ result }) => ({
        action: 'finding.resolve',
        entity: 'VehicleFinding',
        entityId: result.id,
        details: { key: 'finding_resolve', params: { description: result.description } },
        metadata: { findingId: result.id, vehicleId: result.vehicleId },
      }),
    }
  )
}

export async function deleteFinding(findingId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const finding = await db.vehicleFinding.findFirst({
        where: { id: findingId, vehicle: { organizationId } },
      })
      if (!finding) throw new Error('Finding not found')

      await db.vehicleFinding.delete({ where: { id: findingId } })
      revalidatePath(`/vehicles/${finding.vehicleId}`)
      revalidatePath('/')
      return { findingId }
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.VEHICLES,
        },
      ],
      audit: ({ result }) => ({
        action: 'finding.delete',
        entity: 'VehicleFinding',
        entityId: result.findingId,
        details: { key: 'finding_delete', params: { id: result.findingId } },
        metadata: { findingId: result.findingId },
      }),
    }
  )
}
