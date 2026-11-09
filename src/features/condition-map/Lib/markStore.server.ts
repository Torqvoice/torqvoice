import 'server-only'
import { db } from '@/lib/db'
import { releaseFiles } from '@/lib/files/manager'
import { assertOwnUploads } from '@/lib/upload-url'
import {
  type ConditionMarkData,
  type MarkInput,
  type MarkPatch,
  type MarkScope,
  splitMarks,
} from './marks'
import { loadVehicleConditionMarks, MARK_SELECT } from './loadMarks.server'

/**
 * Writing marks on the condition map: the rules every way in shares. The
 * web's actions and the technician app's API both call these after their own
 * sign-in and permission checks, so a mark follows the same rules whichever
 * screen drew it. Nothing here revalidates a page; the caller does.
 */

/** A sheet a mark is drawn on: an inspection's check, or a work order. */
export interface MarkSheet {
  vehicleId: string
  inspectionId?: string | null
  inspectionItemId?: string | null
  serviceRecordId?: string | null
}

/**
 * The sheet a mark is drawn on must belong to this workshop, be for that
 * vehicle, and be open: a completed inspection keeps its marks as they were.
 * Answers with the visit the sheet records.
 */
export async function assertSheetOpen(
  organizationId: string,
  scope: MarkSheet
): Promise<MarkScope> {
  if (scope.inspectionId) {
    const inspection = await db.inspection.findFirst({
      where: { id: scope.inspectionId, organizationId, vehicleId: scope.vehicleId },
      select: {
        status: true,
        createdAt: true,
        items: { where: { id: scope.inspectionItemId ?? '' }, select: { id: true } },
      },
    })
    if (!inspection) throw new Error('Inspection not found')
    if (inspection.status === 'completed')
      throw new Error('Reopen the inspection to change its condition map')
    if (scope.inspectionItemId && inspection.items.length === 0) throw new Error('Check not found')
    return {
      inspectionId: scope.inspectionId,
      inspectionItemId: scope.inspectionItemId ?? '',
      openedAt: inspection.createdAt,
    }
  }
  if (scope.serviceRecordId) {
    const job = await db.serviceRecord.findFirst({
      where: { id: scope.serviceRecordId, organizationId, vehicleId: scope.vehicleId },
      select: { id: true, inspectionId: true, createdAt: true },
    })
    if (!job) throw new Error('Work order not found')
    return {
      serviceRecordId: job.id,
      linkedInspectionId: job.inspectionId,
      openedAt: job.createdAt,
    }
  }
  throw new Error('A mark needs a sheet to be drawn on')
}

/** The pages that show a sheet's marks. */
export function markPaths(scope: {
  vehicleId: string
  inspectionId?: string | null
  serviceRecordId?: string | null
}): string[] {
  const paths = [`/vehicles/${scope.vehicleId}`]
  if (scope.inspectionId) paths.push(`/inspections/${scope.inspectionId}`)
  if (scope.serviceRecordId)
    paths.push(`/vehicles/${scope.vehicleId}/service/${scope.serviceRecordId}`)
  return paths
}

/**
 * A kind of the workshop's own has to be one of its own. A built-in key is
 * always known; the schema has already refused anything else.
 */
export async function assertKnownKind(organizationId: string, kind: string | undefined) {
  if (!kind || !kind.startsWith('own_')) return
  const known = await db.conditionMarkType.count({ where: { organizationId, key: kind } })
  if (!known) throw new Error('Unknown kind of mark')
}

export async function ownMark(organizationId: string, id: string): Promise<ConditionMarkData> {
  const mark = await db.conditionMark.findFirst({
    where: { id, organizationId },
    select: MARK_SELECT,
  })
  if (!mark) throw new Error('Mark not found')
  return mark
}

export async function createMark(
  organizationId: string,
  userId: string | null,
  input: MarkInput
): Promise<ConditionMarkData> {
  await assertSheetOpen(organizationId, input)
  await assertKnownKind(organizationId, input.kind)
  const mark = await db.conditionMark.create({
    data: {
      organizationId,
      vehicleId: input.vehicleId,
      inspectionId: input.inspectionId ?? null,
      inspectionItemId: input.inspectionItemId ?? null,
      serviceRecordId: input.serviceRecordId ?? null,
      bodyType: input.bodyType,
      view: input.view,
      panel: input.panel,
      x: input.x,
      y: input.y,
      kind: input.kind,
      severity: input.severity,
      note: input.note?.trim() || null,
      recordedById: userId,
    },
    select: MARK_SELECT,
  })
  // The vehicle remembers which drawing it is marked on.
  await db.vehicle.updateMany({
    where: { id: input.vehicleId, organizationId, bodyType: null },
    data: { bodyType: input.bodyType },
  })
  return mark
}

export async function patchMark(
  organizationId: string,
  id: string,
  patch: MarkPatch
): Promise<{ before: ConditionMarkData; after: ConditionMarkData }> {
  const before = await ownMark(organizationId, id)
  await assertSheetOpen(organizationId, before)
  await assertKnownKind(organizationId, patch.kind)
  const after = await db.conditionMark.update({
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
  return { before, after }
}

export async function deleteMark(organizationId: string, id: string): Promise<ConditionMarkData> {
  const mark = await ownMark(organizationId, id)
  await assertSheetOpen(organizationId, mark)
  await db.conditionMark.delete({ where: { id } })
  // Its photos go with it, through the file manager like every delete:
  // to the trash, unless some other row still uses the same file.
  await releaseFiles(mark.imageUrls, { organizationId, reason: 'condition mark removed' })
  return mark
}

/**
 * A mark from an earlier visit that is no longer there: repaired, or never
 * was. It stays as history and stops printing as current. `resolved: false`
 * takes that back.
 */
export async function setMarkResolved(
  organizationId: string,
  userId: string | null,
  id: string,
  resolved: boolean
): Promise<{ before: ConditionMarkData; after: ConditionMarkData }> {
  const before = await ownMark(organizationId, id)
  const after = await db.conditionMark.update({
    where: { id },
    data: resolved
      ? { resolvedAt: new Date(), resolvedById: userId }
      : { resolvedAt: null, resolvedById: null },
    select: MARK_SELECT,
  })
  return { before, after }
}

/**
 * Every mark still open from an earlier visit, confirmed as still there in
 * one go: each is recorded again on this sheet as this visit's own, and the
 * earlier one is closed in the same transaction, so the vehicle never carries
 * the same dent twice and the next visit meets it once.
 *
 * The earlier mark is kept rather than moved, because it is the earlier
 * visit's record: it points at the newer mark, so its own sheet goes on
 * showing it while every other sheet meets the newer one. The new mark
 * keeps the old one's photos by pointing at the same files; the file manager
 * counts both rows, so removing a photo from one leaves the other's in place.
 *
 * Safe to ask twice, or by two people at once: an earlier mark is taken only
 * while it is still open, and whoever comes second finds none left to take.
 */
export async function carryMarks(
  organizationId: string,
  userId: string | null,
  sheet: MarkSheet
): Promise<{ marks: ConditionMarkData[]; carried: ConditionMarkData[] }> {
  const scope = await assertSheetOpen(organizationId, sheet)
  const all = await loadVehicleConditionMarks(organizationId, sheet.vehicleId)
  const earlier = splitMarks(all, scope).previous
  if (earlier.length === 0) return { marks: [], carried: [] }

  const now = new Date()
  const carried: ConditionMarkData[] = []
  const marks = await db.$transaction(async (tx) => {
    const created: ConditionMarkData[] = []
    for (const [index, mark] of earlier.entries()) {
      // Closing it is what claims it. Somebody else who carried or
      // cleared it a moment ago has closed it already, and it is left.
      const claimed = await tx.conditionMark.updateMany({
        where: { id: mark.id, organizationId, resolvedAt: null },
        data: { resolvedAt: now, resolvedById: userId },
      })
      if (claimed.count === 0) continue
      carried.push(mark)
      const next = await tx.conditionMark.create({
        data: {
          organizationId,
          vehicleId: mark.vehicleId,
          inspectionId: sheet.inspectionId ?? null,
          inspectionItemId: sheet.inspectionItemId ?? null,
          serviceRecordId: sheet.serviceRecordId ?? null,
          bodyType: mark.bodyType,
          view: mark.view,
          panel: mark.panel,
          x: mark.x,
          y: mark.y,
          kind: mark.kind,
          severity: mark.severity,
          note: mark.note,
          imageUrls: mark.imageUrls,
          // Marks are numbered by when they were recorded, so each gets
          // a moment of its own and they keep the order they had.
          recordedAt: new Date(now.getTime() + index),
          recordedById: userId,
        },
        select: MARK_SELECT,
      })
      // Closed because it was superseded, not repaired: the earlier
      // sheet still prints it as its own record.
      await tx.conditionMark.update({
        where: { id: mark.id },
        data: { carriedToId: next.id },
      })
      created.push(next)
    }
    return created
  })
  return { marks, carried }
}

export async function addMarkPhotos(
  organizationId: string,
  id: string,
  urls: string[]
): Promise<{ mark: ConditionMarkData; imageUrls: string[] }> {
  assertOwnUploads(urls, organizationId)
  const mark = await ownMark(organizationId, id)
  await assertSheetOpen(organizationId, mark)
  const imageUrls = [...mark.imageUrls, ...urls.filter((u) => !mark.imageUrls.includes(u))]
  await db.conditionMark.update({ where: { id }, data: { imageUrls } })
  return { mark, imageUrls }
}

/**
 * One photo added to a mark, at most `max` on it. The row is locked for the
 * read and the write, so two uploads at once each land, and the limit holds
 * against both. Null when the mark is already full.
 */
export async function appendMarkPhoto(
  organizationId: string,
  id: string,
  url: string,
  max: number
): Promise<{ mark: ConditionMarkData; imageUrls: string[] } | null> {
  assertOwnUploads([url], organizationId)
  const mark = await ownMark(organizationId, id)
  await assertSheetOpen(organizationId, mark)
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "public"."condition_marks" WHERE id = ${id} FOR UPDATE`
    const current = await tx.conditionMark.findFirst({
      where: { id, organizationId },
      select: { imageUrls: true },
    })
    if (!current) throw new Error('Mark not found')
    if (current.imageUrls.length >= max) return null
    const updated = await tx.conditionMark.update({
      where: { id },
      data: { imageUrls: { push: url } },
      select: { imageUrls: true, serviceRecordId: true, inspectionId: true },
    })
    return { mark, imageUrls: updated.imageUrls }
  })
}

export async function removeMarkPhoto(
  organizationId: string,
  id: string,
  url: string
): Promise<{ mark: ConditionMarkData; imageUrls: string[] }> {
  const mark = await ownMark(organizationId, id)
  await assertSheetOpen(organizationId, mark)
  // Read and written under the row lock, as an upload is: a photo that
  // landed while this one was being taken off stays on the mark.
  const { imageUrls, removed } = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "public"."condition_marks" WHERE id = ${id} FOR UPDATE`
    const current = await tx.conditionMark.findFirst({
      where: { id, organizationId },
      select: { imageUrls: true },
    })
    if (!current) throw new Error('Mark not found')
    const next = current.imageUrls.filter((u) => u !== url)
    if (next.length !== current.imageUrls.length) {
      await tx.conditionMark.update({
        where: { id },
        data: { imageUrls: next },
        select: { serviceRecordId: true, inspectionId: true },
      })
    }
    return { imageUrls: next, removed: next.length !== current.imageUrls.length }
  })
  // Only a photo this mark had, and only once the row no longer names it.
  if (removed) {
    await releaseFiles([url], { organizationId, reason: 'condition mark photo removed' })
  }
  return { mark, imageUrls }
}

/**
 * Closes an earlier visit's mark as gone, or opens it again, only if nobody
 * else has closed, reopened or carried it since it was read: the state it
 * was read in is the condition of the write. False when another writer got
 * there first.
 */
export async function setMarkResolvedIfUnchanged(
  organizationId: string,
  userId: string | null,
  id: string,
  resolved: boolean
): Promise<boolean> {
  const claimed = await db.conditionMark.updateMany({
    where: resolved
      ? { id, organizationId, resolvedAt: null, carriedToId: null }
      : { id, organizationId, resolvedAt: { not: null }, carriedToId: null },
    data: resolved
      ? { resolvedAt: new Date(), resolvedById: userId }
      : { resolvedAt: null, resolvedById: null },
  })
  return claimed.count === 1
}
