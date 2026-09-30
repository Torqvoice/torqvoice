import { mkdir, writeFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { db } from '@/lib/db'
import { discardUnsavedUpload } from '@/lib/files/manager'
import { compressPhoto } from '@/lib/image-upload.server'
import { PHOTO_HANDOFF_TTL_SECONDS, verifyInspectionHandoffToken } from '@/lib/photo-handoff'
import { rateLimit } from '@/lib/rate-limit'
import { uploadsRoot } from '@/lib/upload-root'
import {
  INSPECTION_ATTACHMENT_LIMITS,
  INSPECTION_ITEM_PHOTO_LIMIT,
} from '@/features/inspections/Lib/attachmentLimits'

/**
 * A photo or document from a phone that scanned an inspection's "Add from
 * phone" code. The twin of the work order's route (api/public/photo-handoff),
 * with the same bounds, for the same reason: nobody signs in to reach it, so
 * the signed link is the whole permission and what it may write is capped
 * here rather than trusted to the page.
 *
 * With an `itemId` the file is a photo of one check, the evidence next to its
 * grade: photos only, and only while the inspection is open, as on the desk.
 * Without one it is filed on the inspection as a whole, which also takes a
 * PDF (the regulator's own form, filled in and signed) and stays open after
 * the inspection is completed.
 */

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
const PDF_TYPE = 'application/pdf'

const MAX_BYTES = 15 * 1024 * 1024
const MAX_PDF_BYTES = 10 * 1024 * 1024
/** An inspection has many checks, so one code carries more than a work order's. */
const PER_CODE = 60
/** The desk's caps, from the one place they are kept. */
const PER_ITEM = INSPECTION_ITEM_PHOTO_LIMIT
const PHOTOS_PER_INSPECTION = INSPECTION_ATTACHMENT_LIMITS.image
const PDFS_PER_INSPECTION = INSPECTION_ATTACHMENT_LIMITS.document
const RATE_PER_MINUTE = 30

function refuse(status: number, code: string) {
  return NextResponse.json({ code }, { status })
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(request, {
    limit: RATE_PER_MINUTE,
    windowMs: 60_000,
    anonymous: true,
  })
  if (limited) return limited

  const { token } = await params
  const check = verifyInspectionHandoffToken(token)
  if (!check.ok) return refuse(check.reason === 'expired' ? 410 : 404, check.reason)
  const { organizationId, inspectionId, userId, expiresAt } = check.handoff

  const inspection = await db.inspection.findFirst({
    where: { id: inspectionId, organizationId },
    select: { id: true, status: true, vehicle: { select: { licensePlate: true } } },
  })
  if (!inspection) return refuse(404, 'invalid')

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return refuse(400, 'noFile')
  const isPdf = file.type === PDF_TYPE
  if (!isPdf && !PHOTO_TYPES.has(file.type)) return refuse(400, 'type')
  if (file.size === 0) return refuse(400, 'empty')
  if (file.size > (isPdf ? MAX_PDF_BYTES : MAX_BYTES)) return refuse(400, 'tooLarge')

  const itemField = form?.get('itemId')
  const itemId = typeof itemField === 'string' && itemField ? itemField : null
  const item = itemId
    ? await db.inspectionItem.findFirst({
        where: { id: itemId, inspectionId: inspection.id },
        select: { id: true, name: true, imageUrls: true },
      })
    : null
  if (itemId && !item) return refuse(404, 'noItem')
  if (item) {
    if (isPdf) return refuse(400, 'type')
    if (inspection.status === 'completed') return refuse(409, 'completed')
    if (item.imageUrls.length >= PER_ITEM) return refuse(409, 'limit')
  }

  // What phones have added since this code was issued. Nothing on a file says
  // which code brought it, so the count is by time and covers every code
  // open on the inspection at once; the audit log is the record, one row
  // per file this route writes, and the desk's own uploads are not in it.
  // The budget is a ceiling on a leaked link, not a ledger, so a second
  // phone sharing it is the acceptable cost of not tracking codes.
  const issuedAt = new Date((expiresAt - PHOTO_HANDOFF_TTL_SECONDS) * 1000)
  const [onInspection, sinceCode] = await Promise.all([
    item
      ? Promise.resolve(0)
      : db.inspectionAttachment.count({
          where: { inspectionId: inspection.id, category: isPdf ? 'document' : 'image' },
        }),
    db.auditLog.count({
      where: {
        organizationId,
        entity: 'Inspection',
        entityId: inspection.id,
        action: { in: ['inspection.photo_added', 'inspection.file_added'] },
        timestamp: { gte: issuedAt },
      },
    }),
  ])
  if (!item && onInspection >= (isPdf ? PDFS_PER_INSPECTION : PHOTOS_PER_INSPECTION)) {
    return refuse(409, 'limit')
  }
  if (sinceCode >= PER_CODE) return refuse(409, 'codeLimit')

  let stored: { data: Uint8Array; ext: 'jpg' | 'pdf'; type: string }
  const bytes = Buffer.from(await file.arrayBuffer())
  if (isPdf) {
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return refuse(400, 'type')
    stored = { data: new Uint8Array(bytes), ext: 'pdf', type: PDF_TYPE }
  } else {
    try {
      const photo = await compressPhoto(bytes)
      stored = { data: new Uint8Array(photo.data), ext: 'jpg', type: 'image/jpeg' }
    } catch {
      return refuse(400, 'type')
    }
  }

  // Inspection photos live in the services folder, as the desk's do.
  const filename = `${crypto.randomUUID()}.${stored.ext}`
  const dir = path.join(uploadsRoot(), organizationId, 'services')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, filename), stored.data)
  const fileUrl = `/api/protected/files/${organizationId}/services/${filename}`

  // The file is only kept if its row is.
  let createdId: string
  try {
    if (item) {
      // Appended, never written as a list: the desk may be adding its own.
      await db.inspectionItem.update({
        where: { id: item.id },
        data: { imageUrls: { push: fileUrl } },
      })
      createdId = item.id
    } else {
      const attachment = await db.inspectionAttachment.create({
        data: {
          fileName: `${(file.name || (isPdf ? 'document' : 'photo')).replace(/\.[^.]*$/, '').slice(0, 190)}.${stored.ext}`,
          fileUrl,
          fileType: stored.type,
          fileSize: stored.data.length,
          category: isPdf ? 'document' : 'image',
          // A customer's or a regulator's paperwork is not shown until the
          // workshop has looked at it; a photo is, as one added at the desk.
          includeInReport: !isPdf,
          inspectionId: inspection.id,
        },
        select: { id: true },
      })
      createdId = attachment.id
    }
  } catch (err) {
    await discardUnsavedUpload(organizationId, 'services', filename)
    throw err
  }

  await logAudit(
    { userId, organizationId },
    {
      action: item ? 'inspection.photo_added' : 'inspection.file_added',
      entity: 'Inspection',
      entityId: inspection.id,
      details: {
        key: 'inspection_phoneUpload',
        params: { ref: inspection.vehicle?.licensePlate || inspection.id },
      },
      metadata: { inspectionId: inspection.id, itemId: item?.id, via: 'photo-handoff' },
    }
  )
  return NextResponse.json({ id: createdId, url: item ? fileUrl : undefined }, { status: 201 })
}
