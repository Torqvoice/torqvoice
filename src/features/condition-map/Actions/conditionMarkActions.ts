'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { assertOwnUploads } from '@/lib/upload-url'
import { BODY_TYPES } from '../Lib/drawingTypes'
import {
  type ConditionMarkData,
  markInputSchema,
  markPatchSchema,
  numberedMarks,
} from '../Lib/marks'

/**
 * The marks on a vehicle's condition map.
 *
 * Reads take the vehicle, because the map is the vehicle's: every open mark
 * from every visit, so a new sheet starts with what is already known. Writes
 * take the sheet the mark is drawn on, and are allowed to whoever may edit
 * that sheet: an inspection's marks need the inspections permission, a work
 * order's the services one.
 */

const MARK_SELECT = {
  id: true,
  vehicleId: true,
  inspectionId: true,
  inspectionItemId: true,
  serviceRecordId: true,
  bodyType: true,
  view: true,
  panel: true,
  x: true,
  y: true,
  kind: true,
  severity: true,
  note: true,
  imageUrls: true,
  recordedAt: true,
  resolvedAt: true,
} as const

function subjectFor(scope: { inspectionId?: string | null; serviceRecordId?: string | null }) {
  return scope.inspectionId ? PermissionSubject.INSPECTIONS : PermissionSubject.SERVICES
}

/** Every mark ever drawn on the vehicle, oldest first; resolved ones included as history. */
export async function listVehicleConditionMarks(vehicleId: string) {
  return withAuth(
    async ({ organizationId }): Promise<ConditionMarkData[]> => {
      const rows = await db.conditionMark.findMany({
        where: { vehicleId, organizationId },
        select: MARK_SELECT,
        orderBy: { recordedAt: 'asc' },
      })
      return numberedMarks(rows)
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}

/** The same list for a server component, which already knows the organization. */
export async function loadVehicleConditionMarks(
  organizationId: string,
  vehicleId: string
): Promise<ConditionMarkData[]> {
  const rows = await db.conditionMark.findMany({
    where: { vehicleId, organizationId },
    select: MARK_SELECT,
    orderBy: { recordedAt: 'asc' },
  })
  return numberedMarks(rows)
}

/**
 * Checks that the sheet a mark is drawn on is this workshop's, is this
 * vehicle's, and is still open: a completed inspection and an issued
 * invoice keep their marks as they were.
 */
async function assertSheetOpen(
  organizationId: string,
  scope: {
    vehicleId: string
    inspectionId?: string | null
    inspectionItemId?: string | null
    serviceRecordId?: string | null
  }
) {
  if (scope.inspectionId) {
    const inspection = await db.inspection.findFirst({
      where: { id: scope.inspectionId, organizationId, vehicleId: scope.vehicleId },
      select: {
        status: true,
        items: { where: { id: scope.inspectionItemId ?? '' }, select: { id: true } },
      },
    })
    if (!inspection) throw new Error('Inspection not found')
    if (inspection.status === 'completed')
      throw new Error('Reopen the inspection to change its condition map')
    if (scope.inspectionItemId && inspection.items.length === 0) throw new Error('Check not found')
    return
  }
  if (scope.serviceRecordId) {
    const job = await db.serviceRecord.findFirst({
      where: { id: scope.serviceRecordId, organizationId, vehicleId: scope.vehicleId },
      select: { id: true },
    })
    if (!job) throw new Error('Work order not found')
    return
  }
  throw new Error('A mark needs a sheet to be drawn on')
}

function pathsFor(scope: {
  vehicleId: string
  inspectionId?: string | null
  serviceRecordId?: string | null
}) {
  const paths = [`/vehicles/${scope.vehicleId}`]
  if (scope.inspectionId) paths.push(`/inspections/${scope.inspectionId}`)
  if (scope.serviceRecordId)
    paths.push(`/vehicles/${scope.vehicleId}/service/${scope.serviceRecordId}`)
  return paths
}

export async function addConditionMark(input: unknown) {
  const parsed = markInputSchema.parse(input)
  return withAuth(
    async ({ organizationId, userId }): Promise<ConditionMarkData> => {
      await assertSheetOpen(organizationId, parsed)
      const mark = await db.conditionMark.create({
        data: {
          organizationId,
          vehicleId: parsed.vehicleId,
          inspectionId: parsed.inspectionId ?? null,
          inspectionItemId: parsed.inspectionItemId ?? null,
          serviceRecordId: parsed.serviceRecordId ?? null,
          bodyType: parsed.bodyType,
          view: parsed.view,
          panel: parsed.panel,
          x: parsed.x,
          y: parsed.y,
          kind: parsed.kind,
          severity: parsed.severity,
          note: parsed.note?.trim() || null,
          recordedById: userId,
        },
        select: MARK_SELECT,
      })
      // The vehicle remembers which drawing it is marked on.
      await db.vehicle.updateMany({
        where: { id: parsed.vehicleId, organizationId, bodyType: null },
        data: { bodyType: parsed.bodyType },
      })
      for (const path of pathsFor(parsed)) revalidatePath(path)
      return mark
    },
    {
      requiredPermissions: [{ action: PermissionAction.UPDATE, subject: subjectFor(parsed) }],
      audit: ({ result }) => ({
        action: 'conditionMark.add',
        entity: 'ConditionMark',
        entityId: result.id,
        details: { key: 'condition_mark_add', params: { kind: result.kind, panel: result.panel } },
        metadata: { vehicleId: result.vehicleId },
      }),
    }
  )
}

async function ownMark(organizationId: string, id: string) {
  const mark = await db.conditionMark.findFirst({
    where: { id, organizationId },
    select: MARK_SELECT,
  })
  if (!mark) throw new Error('Mark not found')
  return mark
}

export async function updateConditionMark(id: string, input: unknown) {
  const patch = markPatchSchema.parse(input)
  return withAuth(
    async ({ organizationId }): Promise<ConditionMarkData> => {
      const mark = await ownMark(organizationId, id)
      await assertSheetOpen(organizationId, mark)
      const updated = await db.conditionMark.update({
        where: { id },
        data: {
          ...(patch.kind ? { kind: patch.kind } : {}),
          ...(patch.severity ? { severity: patch.severity } : {}),
          ...(patch.note !== undefined ? { note: patch.note?.trim() || null } : {}),
          ...(patch.x !== undefined ? { x: patch.x } : {}),
          ...(patch.y !== undefined ? { y: patch.y } : {}),
          ...(patch.view ? { view: patch.view } : {}),
          ...(patch.panel ? { panel: patch.panel } : {}),
        },
        select: MARK_SELECT,
      })
      for (const path of pathsFor(mark)) revalidatePath(path)
      return updated
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}

export async function removeConditionMark(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const mark = await ownMark(organizationId, id)
      await assertSheetOpen(organizationId, mark)
      await db.conditionMark.delete({ where: { id } })
      for (const path of pathsFor(mark)) revalidatePath(path)
      return { id, vehicleId: mark.vehicleId }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
      audit: ({ result }) => ({
        action: 'conditionMark.remove',
        entity: 'ConditionMark',
        entityId: result.id,
        details: { key: 'condition_mark_remove' },
        metadata: { vehicleId: result.vehicleId },
      }),
    }
  )
}

/**
 * A mark from an earlier visit that is no longer there: repaired, or never
 * was. It stays as history and stops printing as current. `resolved: false`
 * takes that back.
 */
export async function resolveConditionMark(id: string, resolved: boolean) {
  return withAuth(
    async ({ organizationId, userId }): Promise<ConditionMarkData> => {
      const mark = await ownMark(organizationId, id)
      const updated = await db.conditionMark.update({
        where: { id },
        data: resolved
          ? { resolvedAt: new Date(), resolvedById: userId }
          : { resolvedAt: null, resolvedById: null },
        select: MARK_SELECT,
      })
      revalidatePath(`/vehicles/${mark.vehicleId}`)
      return updated
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}

const photosSchema = z.object({ id: z.string(), urls: z.array(z.string()).min(1).max(10) })

export async function addConditionMarkPhotos(input: unknown) {
  const { id, urls } = photosSchema.parse(input)
  return withAuth(
    async ({ organizationId }): Promise<string[]> => {
      assertOwnUploads(urls, organizationId)
      const mark = await ownMark(organizationId, id)
      await assertSheetOpen(organizationId, mark)
      const next = [...mark.imageUrls, ...urls.filter((u) => !mark.imageUrls.includes(u))]
      await db.conditionMark.update({ where: { id }, data: { imageUrls: next } })
      for (const path of pathsFor(mark)) revalidatePath(path)
      return next
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}

export async function removeConditionMarkPhoto(input: unknown) {
  const { id, url } = z.object({ id: z.string(), url: z.string() }).parse(input)
  return withAuth(
    async ({ organizationId }): Promise<string[]> => {
      const mark = await ownMark(organizationId, id)
      await assertSheetOpen(organizationId, mark)
      const next = mark.imageUrls.filter((u) => u !== url)
      await db.conditionMark.update({ where: { id }, data: { imageUrls: next } })
      for (const path of pathsFor(mark)) revalidatePath(path)
      return next
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}

/** Which drawing the vehicle is marked on, chosen by hand. */
export async function setVehicleBodyType(vehicleId: string, bodyType: string) {
  const body = z.enum(BODY_TYPES).parse(bodyType)
  return withAuth(
    async ({ organizationId }) => {
      const result = await db.vehicle.updateMany({
        where: { id: vehicleId, organizationId },
        data: { bodyType: body },
      })
      if (result.count === 0) throw new Error('Vehicle not found')
      revalidatePath(`/vehicles/${vehicleId}`)
      return { vehicleId, bodyType: body }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}
