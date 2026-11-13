'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { auditDetails } from '@/lib/audit'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { assertOwnUploads } from '@/lib/upload-url'
import { releaseFiles } from '@/lib/files/manager'
import { BODY_TYPES } from '../Lib/drawingTypes'
import { type ConditionMarkData, markInputSchema, markPatchSchema } from '../Lib/marks'
import { loadVehicleConditionMarks } from '../Lib/loadMarks.server'
import {
  addMarkPhotos,
  carryMarks,
  createMark,
  deleteMark,
  markPaths,
  patchMark,
  removeMarkPhoto,
  setMarkResolved,
} from '../Lib/markStore.server'

/**
 * The marks on a vehicle's condition map.
 *
 * Reads take the vehicle, because the map is the vehicle's: every open mark
 * from every visit, so a new sheet starts with what is already known. Writes
 * take the sheet the mark is drawn on, and are allowed to whoever may edit
 * that sheet: an inspection's marks need the inspections permission, a work
 * order's the services one.
 */

function subjectFor(scope: { inspectionId?: string | null; serviceRecordId?: string | null }) {
  return scope.inspectionId ? PermissionSubject.INSPECTIONS : PermissionSubject.SERVICES
}

/**
 * Every mark ever drawn on the vehicle, oldest first; resolved ones included
 * as history. The same list the page loads, so a card can read itself back.
 */
export async function listVehicleConditionMarks(vehicleId: string) {
  return withAuth(
    async ({ organizationId }): Promise<ConditionMarkData[]> =>
      loadVehicleConditionMarks(organizationId, vehicleId),
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}

export async function addConditionMark(input: unknown) {
  const result = markInputSchema.safeParse(input)
  if (!result.success) return { success: false as const, error: 'Invalid mark' }
  const parsed = result.data
  return withAuth(
    async ({ organizationId, userId }): Promise<ConditionMarkData> => {
      const mark = await createMark(organizationId, userId, parsed)
      for (const path of markPaths(parsed)) revalidatePath(path)
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

export async function updateConditionMark(id: string, input: unknown) {
  const result = markPatchSchema.safeParse(input)
  if (!result.success) return { success: false as const, error: 'Invalid mark' }
  const patch = result.data
  return withAuth(
    async ({ organizationId }): Promise<ConditionMarkData> => {
      const { before, after } = await patchMark(organizationId, id, patch)
      for (const path of markPaths(before)) revalidatePath(path)
      return after
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
      const mark = await deleteMark(organizationId, id)
      for (const path of markPaths(mark)) revalidatePath(path)
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
      const { before, after } = await setMarkResolved(organizationId, userId, id, resolved)
      // The vehicle page and the sheet the mark was drawn on both show it.
      for (const path of markPaths(before)) revalidatePath(path)
      return after
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}

const carrySchema = z
  .object({
    vehicleId: z.string().min(1),
    inspectionId: z.string().min(1).optional().nullable(),
    inspectionItemId: z.string().min(1).optional().nullable(),
    serviceRecordId: z.string().min(1).optional().nullable(),
  })
  // One sheet, named whole: an inspection's check, or a work order.
  .refine((sheet) =>
    sheet.serviceRecordId
      ? !sheet.inspectionId && !sheet.inspectionItemId
      : Boolean(sheet.inspectionId && sheet.inspectionItemId)
  )

/** Every mark still open from an earlier visit, confirmed as still there; see carryMarks. */
export async function carryConditionMarks(input: unknown) {
  const result = carrySchema.safeParse(input)
  if (!result.success) return { success: false as const, error: 'Invalid sheet' }
  const sheet = result.data
  return withAuth(
    async ({
      organizationId,
      userId,
    }): Promise<{ vehicleId: string; marks: ConditionMarkData[]; carried: string[] }> => {
      const { marks, carried } = await carryMarks(organizationId, userId, sheet)
      // This sheet, and every sheet a mark was carried from.
      const paths = new Set(markPaths(sheet))
      for (const mark of carried) for (const path of markPaths(mark)) paths.add(path)
      for (const path of paths) revalidatePath(path)
      return { vehicleId: sheet.vehicleId, marks, carried: carried.map((mark) => mark.id) }
    },
    {
      // Recording on the sheet, and closing a mark on the vehicle: the right
      // each of the two already asks for on its own.
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: subjectFor(sheet) },
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
      audit: ({ result }) =>
        result.marks.length === 0
          ? null
          : {
              action: 'conditionMark.carry',
              entity: 'Vehicle',
              entityId: result.vehicleId,
              details: { key: 'condition_mark_carry', params: { count: result.marks.length } },
              metadata: { vehicleId: result.vehicleId },
            },
    }
  )
}

const photosSchema = z.object({ id: z.string(), urls: z.array(z.string()).min(1).max(10) })

export async function addConditionMarkPhotos(input: unknown) {
  const result = photosSchema.safeParse(input)
  if (!result.success) return { success: false as const, error: 'Invalid photos' }
  const { id, urls } = result.data
  return withAuth(
    async ({ organizationId }): Promise<string[]> => {
      const { mark, imageUrls } = await addMarkPhotos(organizationId, id, urls)
      for (const path of markPaths(mark)) revalidatePath(path)
      return imageUrls
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}

export async function removeConditionMarkPhoto(input: unknown) {
  const parsed = z.object({ id: z.string(), url: z.string() }).safeParse(input)
  if (!parsed.success) return { success: false as const, error: 'Invalid photo' }
  const { id, url } = parsed.data
  return withAuth(
    async ({ organizationId }): Promise<string[]> => {
      const { mark, imageUrls } = await removeMarkPhoto(organizationId, id, url)
      for (const path of markPaths(mark)) revalidatePath(path)
      return imageUrls
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

/**
 * Whether this job's invoice prints the condition map: the switch on the
 * drop-off tab, which overrides the design's answer for this one invoice.
 */
export async function setConditionMapOnInvoice(serviceRecordId: string, on: boolean) {
  const id = z.string().min(1).parse(serviceRecordId)
  const wanted = z.boolean().parse(on)
  return withAuth(
    async ({ organizationId }) => {
      const job = await db.serviceRecord.findFirst({
        where: { id, organizationId },
        select: { id: true, vehicleId: true },
      })
      if (!job) throw new Error('Work order not found')
      await db.serviceRecord.update({ where: { id }, data: { conditionMapOnInvoice: wanted } })
      if (job.vehicleId) revalidatePath(`/vehicles/${job.vehicleId}/service/${id}`)
      return { serviceRecordId: id, onInvoice: wanted }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'conditionMark.onInvoice',
        entity: 'ServiceRecord',
        entityId: result.serviceRecordId,
        details: auditDetails(
          result.onInvoice ? 'condition_map_on_invoice_on' : 'condition_map_on_invoice_off'
        ),
      }),
    }
  )
}

const unsavedSchema = z.object({ urls: z.array(z.string()).min(1).max(50) })

/**
 * Photos uploaded for a mark whose save then failed (the sheet was closed in
 * the meantime, or the mark was removed). They are on disk with no row, so
 * they go to the trash now rather than waiting a week for the sweep. The file
 * manager checks every one against the database first, so a URL some row does
 * use is kept.
 */
export async function discardConditionMarkUploads(input: unknown) {
  const parsed = unsavedSchema.safeParse(input)
  if (!parsed.success) return { success: false as const, error: 'Invalid photos' }
  const { urls } = parsed.data
  return withAuth(
    async ({ organizationId }) => {
      assertOwnUploads(urls, organizationId)
      const result = await releaseFiles(urls, {
        organizationId,
        reason: 'condition mark photos not saved',
      })
      return { removed: result.removed.length }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}
