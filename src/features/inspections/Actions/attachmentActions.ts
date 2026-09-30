'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { assertOwnUploads, uploadUrlSchema } from '@/lib/upload-url'
import { releaseFiles } from '@/lib/files/manager'
import { createInspectionHandoffToken } from '@/lib/photo-handoff'
import { INSPECTION_ATTACHMENT_LIMITS, INSPECTION_ITEM_PHOTO_LIMIT } from '../Lib/attachmentLimits'

const READ = [{ action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS }]
const UPDATE = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS }]

const MAX_ITEM_MEDIA = INSPECTION_ITEM_PHOTO_LIMIT

const addSchema = z.object({
  inspectionId: z.string().min(1),
  attachment: z.object({
    fileName: z.string().trim().min(1).max(255),
    fileUrl: uploadUrlSchema,
    fileType: z.string().trim().min(1).max(100),
    fileSize: z.number().int().min(0),
    category: z.enum(['image', 'document', 'video']),
    description: z.string().trim().max(500).optional(),
    includeInReport: z.boolean().optional(),
  }),
})

const updateSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().max(500).optional(),
  includeInReport: z.boolean().optional(),
})

const itemMediaSchema = z.object({
  itemId: z.string().min(1),
  urls: z.array(uploadUrlSchema).min(1).max(MAX_ITEM_MEDIA),
})

function revalidateInspection(inspectionId: string) {
  revalidatePath(`/inspections/${inspectionId}`)
}

/**
 * Files an upload on the inspection as a whole. The upload route has already
 * written the bytes; this records them, one at a time, so each tile appears as
 * its file lands and a failed tenth upload does not lose the first nine.
 */
export async function addInspectionAttachment(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = addSchema.parse(input)
      assertOwnUploads(data, organizationId)

      const inspection = await db.inspection.findFirst({
        where: { id: data.inspectionId, organizationId },
        select: { id: true },
      })
      if (!inspection) throw new Error('Inspection not found')

      // Capped per kind, as the card offers them: a hundred photos must not
      // leave no room for the one signed form.
      const { attachment } = data
      const limit = INSPECTION_ATTACHMENT_LIMITS[attachment.category]
      const count = await db.inspectionAttachment.count({
        where: { inspectionId: inspection.id, category: attachment.category },
      })
      if (count >= limit) {
        throw new Error(`This inspection already holds ${limit} ${attachment.category} files.`)
      }

      const created = await db.inspectionAttachment.create({
        data: {
          fileName: attachment.fileName,
          fileUrl: attachment.fileUrl,
          fileType: attachment.fileType,
          fileSize: attachment.fileSize,
          category: attachment.category,
          description: attachment.description || null,
          // Photos and video are taken to be shown; paperwork waits until the
          // workshop has looked at it.
          includeInReport: attachment.includeInReport ?? attachment.category !== 'document',
          inspectionId: inspection.id,
        },
      })
      revalidateInspection(inspection.id)
      return created
    },
    { requiredPermissions: UPDATE }
  )
}

/** Edits the caption, or decides whether the customer sees the file. */
export async function updateInspectionAttachment(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = updateSchema.parse(input)
      const existing = await db.inspectionAttachment.findFirst({
        where: { id: data.id, inspection: { organizationId } },
        select: { id: true, inspectionId: true },
      })
      if (!existing) throw new Error('File not found')

      const updated = await db.inspectionAttachment.update({
        where: { id: existing.id },
        data: {
          ...(data.description !== undefined ? { description: data.description || null } : {}),
          ...(data.includeInReport !== undefined ? { includeInReport: data.includeInReport } : {}),
        },
      })
      revalidateInspection(existing.inspectionId)
      return updated
    },
    { requiredPermissions: UPDATE }
  )
}

/** Removes a file; the bytes go only when nothing else still points at them. */
export async function deleteInspectionAttachment(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const existing = await db.inspectionAttachment.findFirst({
        where: { id, inspection: { organizationId } },
        select: { id: true, inspectionId: true, fileUrl: true },
      })
      if (!existing) throw new Error('File not found')

      await db.inspectionAttachment.delete({ where: { id: existing.id } })
      await releaseFiles([existing.fileUrl], {
        organizationId,
        reason: 'inspection file deleted',
      })
      revalidateInspection(existing.inspectionId)
      return { deleted: true }
    },
    { requiredPermissions: UPDATE }
  )
}

/**
 * Adds photos to one check, appended in the database rather than written as
 * the page's whole list. A phone can be adding photos to the same check while
 * the desk adds its own; a list written back from either screen would drop
 * the other's.
 */
export async function addInspectionItemMedia(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = itemMediaSchema.parse(input)
      assertOwnUploads(data, organizationId)

      const item = await db.inspectionItem.findFirst({
        where: { id: data.itemId, inspection: { organizationId } },
        select: {
          id: true,
          imageUrls: true,
          inspection: { select: { id: true, status: true } },
        },
      })
      if (!item) throw new Error('Inspection item not found')
      if (item.inspection.status === 'completed') {
        throw new Error('Reopen the inspection to change its photos')
      }
      if (item.imageUrls.length + data.urls.length > MAX_ITEM_MEDIA) {
        throw new Error(`A check holds at most ${MAX_ITEM_MEDIA} photos.`)
      }

      const updated = await db.inspectionItem.update({
        where: { id: item.id },
        data: { imageUrls: { push: data.urls } },
        select: { imageUrls: true },
      })
      revalidateInspection(item.inspection.id)
      return updated.imageUrls
    },
    { requiredPermissions: UPDATE }
  )
}

/**
 * Takes one photo off a check, removed in the database for the same reason
 * photos are added there: a photo a phone adds meanwhile must not be lost.
 */
export async function removeInspectionItemMedia(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = z.object({ itemId: z.string().min(1), url: z.string().min(1) }).parse(input)

      const item = await db.inspectionItem.findFirst({
        where: { id: data.itemId, inspection: { organizationId } },
        select: { id: true, inspection: { select: { id: true, status: true } } },
      })
      if (!item) throw new Error('Inspection item not found')
      if (item.inspection.status === 'completed') {
        throw new Error('Reopen the inspection to change its photos')
      }

      const rows = await db.$queryRaw<{ imageUrls: string[] }[]>`
        UPDATE "public"."inspection_items"
        SET "imageUrls" = array_remove("imageUrls", ${data.url})
        WHERE "id" = ${item.id}
        RETURNING "imageUrls"`

      // The file goes to the trash unless another row still uses it.
      await releaseFiles([data.url], { organizationId, reason: 'inspection photo removed' })
      revalidateInspection(item.inspection.id)
      return rows[0]?.imageUrls ?? []
    },
    { requiredPermissions: UPDATE }
  )
}

/**
 * A code for the inspection's "Add from phone": a signed link that lets a
 * phone that is not signed in add photos to its checks, and photos or
 * documents to the inspection, for half an hour. See lib/photo-handoff.ts.
 */
export async function createInspectionHandoffLink(inspectionId: string) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const inspection = await db.inspection.findFirst({
        where: { id: inspectionId, organizationId },
        select: { id: true },
      })
      if (!inspection) throw new Error('Inspection not found')
      const { token, expiresAt } = createInspectionHandoffToken({
        organizationId,
        inspectionId: inspection.id,
        userId,
      })
      return { token, expiresAt: expiresAt.toISOString() }
    },
    { requiredPermissions: UPDATE }
  )
}

/**
 * How many photos and files the inspection holds, on its checks and on itself.
 * The desk's phone dialog asks every few seconds and refreshes the page when
 * the number moves. A check's photos carry no timestamp, so this is a total
 * and the dialog counts from the first answer it gets.
 */
export async function countInspectionMedia(inspectionId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const [items, attachments] = await Promise.all([
        db.inspectionItem.findMany({
          where: { inspectionId, inspection: { organizationId } },
          select: { imageUrls: true },
        }),
        db.inspectionAttachment.count({
          where: { inspectionId, inspection: { organizationId } },
        }),
      ])
      return items.reduce((sum, item) => sum + item.imageUrls.length, 0) + attachments
    },
    { requiredPermissions: READ }
  )
}
