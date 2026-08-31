'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { requireTireHotel } from '../Lib/tireHotelSettings'

const READ = [{ action: PermissionAction.READ, subject: PermissionSubject.TIRE_HOTEL }]
const UPDATE = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.TIRE_HOTEL }]

const attachmentSchema = z.object({
  tireSetId: z.string().min(1),
  files: z
    .array(
      z.object({
        fileName: z.string().trim().min(1).max(255),
        fileUrl: z.string().trim().min(1).max(500),
        fileType: z.string().trim().min(1).max(100),
        fileSize: z.coerce.number().int().min(0),
        description: z.string().trim().max(500).optional().or(z.literal('')),
      })
    )
    .min(1)
    .max(20),
})

const updateSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  includeInInvoice: z.boolean().optional(),
})

function revalidateSet(tireSetId: string) {
  revalidatePath('/tire-hotel')
  revalidatePath(`/tire-hotel/${tireSetId}`)
}

/** What is held against this set, oldest first so the story reads forwards. */
export async function getAttachmentsForSet(tireSetId: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)
      return db.tireSetAttachment.findMany({
        where: { tireSetId, organizationId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          fileType: true,
          fileSize: true,
          description: true,
          includeInInvoice: true,
          createdAt: true,
          uploadedBy: { select: { id: true, name: true } },
        },
      })
    },
    { requiredPermissions: READ }
  )
}

/**
 * Records files already uploaded against a set.
 *
 * The upload endpoint has written the bytes and handed back a URL; this only
 * files them. Split that way because a technician photographing four rims
 * should see each one appear as it finishes rather than watching one long
 * request, and a failed sixth upload should not lose the first five.
 */
export async function addTireSetAttachments(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireTireHotel(organizationId)
      const data = attachmentSchema.parse(input)

      const set = await db.tireSet.findFirst({
        where: { id: data.tireSetId, organizationId },
        select: { id: true, reference: true },
      })
      if (!set) throw new Error('Tire set not found')

      const last = await db.tireSetAttachment.findFirst({
        where: { tireSetId: set.id },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      })
      const start = (last?.sortOrder ?? -1) + 1

      await db.tireSetAttachment.createMany({
        data: data.files.map((file, index) => ({
          fileName: file.fileName,
          fileUrl: file.fileUrl,
          fileType: file.fileType,
          fileSize: file.fileSize,
          description: file.description || null,
          // Photos are taken to be shown and default onto the invoice;
          // documents are the set's own paperwork and never travel to a job.
          includeInInvoice: file.fileType.startsWith('image/'),
          sortOrder: start + index,
          tireSetId: set.id,
          organizationId,
          uploadedById: userId,
        })),
      })

      revalidateSet(set.id)
      return { tireSetId: set.id, reference: set.reference, added: data.files.length }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_set.attach',
        entity: 'TireSet',
        entityId: result.tireSetId,
        details: {
          key: 'tire_set_attach',
          params: { count: result.added, ref: result.reference ?? result.tireSetId },
        },
      }),
    }
  )
}

/** Edits the caption, or decides whether it reaches the customer's invoice. */
export async function updateTireSetAttachment(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)
      const data = updateSchema.parse(input)

      const existing = await db.tireSetAttachment.findFirst({
        where: { id: data.id, organizationId },
        select: { id: true, tireSetId: true },
      })
      if (!existing) throw new Error('File not found')

      await db.tireSetAttachment.update({
        where: { id: existing.id },
        data: {
          ...(data.description !== undefined ? { description: data.description || null } : {}),
          ...(data.includeInInvoice !== undefined
            ? { includeInInvoice: data.includeInInvoice }
            : {}),
        },
      })

      revalidateSet(existing.tireSetId)
      return { id: existing.id, tireSetId: existing.tireSetId }
    },
    { requiredPermissions: UPDATE }
  )
}

/**
 * Removes a file from the set.
 *
 * The row goes; the bytes stay on disk. Anything already copied onto an
 * invoice points at the same file, and deleting it there would blank an image
 * on a document a customer may already hold.
 */
export async function deleteTireSetAttachment(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const existing = await db.tireSetAttachment.findFirst({
        where: { id, organizationId },
        select: { id: true, tireSetId: true, fileName: true },
      })
      if (!existing) throw new Error('File not found')

      await db.tireSetAttachment.delete({ where: { id: existing.id } })
      revalidateSet(existing.tireSetId)
      return existing
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_set.detach',
        entity: 'TireSet',
        entityId: result.tireSetId,
        details: { key: 'tire_set_detach', params: { fileName: result.fileName } },
      }),
    }
  )
}
