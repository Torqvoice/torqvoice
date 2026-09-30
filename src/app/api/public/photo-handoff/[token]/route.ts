import { mkdir, writeFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { discardUnsavedUpload } from '@/lib/files/manager'
import { compressPhoto } from '@/lib/image-upload.server'
import { type DropoffSlot, isDropoffSlot } from '@/lib/dropoff-slots'
import { PHOTO_HANDOFF_TTL_SECONDS, verifyPhotoHandoffToken } from '@/lib/photo-handoff'
import { rateLimit } from '@/lib/rate-limit'
import { uploadsRoot } from '@/lib/upload-root'

/**
 * A photo from a phone that scanned a work order's "Add photos from phone"
 * code. The phone is not signed in; the signed link in the address is the
 * whole permission, and it can do exactly one thing: add an image to the job
 * it names (under its concern, if it names one). See lib/photo-handoff.ts.
 *
 * One request, not the web page's two, for the reason the technician app's
 * upload gives: a phone in a car park loses signal, and a file written without
 * its row is a file nothing points at. Answers carry a `code` the phone page
 * turns into words; the page is in the phone's language, not the server's.
 */

/** What a phone camera produces. Nothing else has a reason to arrive here. */
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
/**
 * And a customer's paperwork: an old invoice, a registration document. PDF
 * only; an office file is a parser somewhere that has to be right, and a phone
 * has no reason to send one.
 */
const PDF_TYPE = 'application/pdf'

/**
 * Nobody signs in to reach this route, so what it may put on the disk is
 * bounded here rather than trusted to the page:
 * - every photo is decoded and saved again as a 1200px JPEG (a few hundred
 *   KB), so an original straight off a phone camera, or a crafted file, is
 *   never stored as sent;
 * - a PDF cannot be shrunk, so it has to start like one, is capped at
 *   MAX_PDF_BYTES, and a job takes at most PDFS_PER_JOB of them;
 * - a request larger than MAX_BYTES is refused before it is decoded;
 * - one code adds at most PER_CODE files of either kind, and a job takes at
 *   most PHOTOS_PER_JOB photos from phones whatever its plan allows (the
 *   plan's own caps apply too);
 * - one address may send RATE_PER_MINUTE a minute.
 * So one code costs at most thirty files' worth of disk, however the link is
 * used.
 */
const MAX_BYTES = 15 * 1024 * 1024
const MAX_PDF_BYTES = 10 * 1024 * 1024
const PER_CODE = 30
const PHOTOS_PER_JOB = 100
const PDFS_PER_JOB = 20
/** A walk round a car is six shots and a few of the damage; thirty is generous. */
const DROPOFF_PER_JOB = 30
const RATE_PER_MINUTE = 30

function refuse(status: number, code: string) {
  return NextResponse.json({ code }, { status })
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  // Keyed on the address: nobody here has a session, and a token that changes
  // with every request must not earn a fresh budget with it.
  const limited = rateLimit(request, {
    limit: RATE_PER_MINUTE,
    windowMs: 60_000,
    anonymous: true,
  })
  if (limited) return limited

  const { token } = await params
  const check = verifyPhotoHandoffToken(token)
  if (!check.ok) return refuse(check.reason === 'expired' ? 410 : 404, check.reason)
  const { organizationId, serviceRecordId, concernId, purpose, userId, expiresAt } = check.handoff
  const dropoff = purpose === 'dropoff'

  const job = await db.serviceRecord.findFirst({
    where: { id: serviceRecordId, organizationId },
    select: { id: true, invoiceNumber: true },
  })
  if (!job) return refuse(404, 'invalid')

  // A concern removed since the code was shown: the photo still belongs to
  // the job, so it lands there rather than being refused.
  const concern = concernId
    ? await db.serviceConcern.findFirst({
        where: { id: concernId, serviceRecordId: job.id },
        select: { id: true },
      })
    : null

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return refuse(400, 'noFile')
  const isPdf = file.type === PDF_TYPE
  // The walk round the car is photographs. Paperwork has the ordinary code.
  if (dropoff && isPdf) return refuse(400, 'type')
  if (!isPdf && !PHOTO_TYPES.has(file.type)) return refuse(400, 'type')
  if (file.size === 0) return refuse(400, 'empty')
  if (file.size > (isPdf ? MAX_PDF_BYTES : MAX_BYTES)) return refuse(400, 'tooLarge')
  const category = dropoff ? 'dropoff' : isPdf ? 'document' : 'image'
  // Which shot this is, from the fixed list and nothing else: the value is
  // stored and shown on the work order.
  const slotField = form?.get('slot')
  const slot: DropoffSlot | null = !dropoff ? null : isDropoffSlot(slotField) ? slotField : 'other'

  // Counted before anything is decoded or written: the cheap refusals first.
  const issuedAt = new Date((expiresAt - PHOTO_HANDOFF_TTL_SECONDS) * 1000)
  const [features, onJob, sinceCode] = await Promise.all([
    getFeatures(organizationId),
    db.serviceAttachment.count({ where: { serviceRecordId: job.id, category } }),
    db.serviceAttachment.count({
      where: {
        serviceRecordId: job.id,
        category: { in: ['image', 'document', 'dropoff'] },
        createdAt: { gte: issuedAt },
      },
    }),
  ])
  const jobCap = dropoff
    ? DROPOFF_PER_JOB
    : isPdf
      ? Math.min(features.maxDocumentsPerService, PDFS_PER_JOB)
      : Math.min(features.maxImagesPerService, PHOTOS_PER_JOB)
  if (onJob >= jobCap) return refuse(409, 'limit')
  if (sinceCode >= PER_CODE) return refuse(409, 'codeLimit')

  let stored: { data: Uint8Array; ext: 'jpg' | 'pdf'; type: string }
  const bytes = Buffer.from(await file.arrayBuffer())
  if (isPdf) {
    // What it is, not what it calls itself.
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return refuse(400, 'type')
    stored = { data: new Uint8Array(bytes), ext: 'pdf', type: PDF_TYPE }
  } else {
    try {
      const photo = await compressPhoto(bytes)
      stored = { data: new Uint8Array(photo.data), ext: 'jpg', type: 'image/jpeg' }
    } catch {
      // Not a picture sharp can read, whatever it called itself.
      return refuse(400, 'type')
    }
  }

  // The name on disk is generated; the phone's own name is only a label.
  const filename = `${crypto.randomUUID()}.${stored.ext}`
  const dir = path.join(uploadsRoot(), organizationId, 'services')
  await mkdir(dir, { recursive: true })
  const target = path.join(dir, filename)
  await writeFile(target, stored.data)

  // The file is only kept if its row is: a file on disk that no attachment
  // points at is one nothing will ever delete.
  const attachment = await db.serviceAttachment
    .create({
      data: {
        // The phone's name as a label, with the extension the stored file has.
        fileName: `${(file.name || category).replace(/\.[^.]*$/, '').slice(0, 190)}.${stored.ext}`,
        fileUrl: `/api/protected/files/${organizationId}/services/${filename}`,
        fileType: stored.type,
        fileSize: stored.data.length,
        category,
        // A photo shows on the invoice unless somebody says otherwise, as one
        // added on the page does. A document does not: an invoice download
        // appends every attached PDF, and a customer's paperwork should not
        // reach the invoice before the workshop has looked at it.
        //
        // Nor does a drop-off photo. It is the workshop's record of the car as
        // it arrived, for the day somebody says a scratch is new; the desk can
        // still choose to show one.
        includeInInvoice: !isPdf && !dropoff,
        description: slot,
        serviceRecordId: job.id,
        concernId: concern?.id ?? null,
      },
      select: { id: true },
    })
    .catch(async (err) => {
      await discardUnsavedUpload(organizationId, 'services', filename)
      throw err
    })

  // In the job's history under whoever showed the code: the phone has no
  // name of its own, and they are who let it in.
  await logAudit(
    { userId, organizationId },
    {
      action: 'service.update',
      entity: 'ServiceRecord',
      entityId: job.id,
      details: { key: 'service_update', params: { ref: job.invoiceNumber || job.id } },
      metadata: { serviceRecordId: job.id, attachmentId: attachment.id, via: 'photo-handoff' },
    }
  )
  return NextResponse.json({ id: attachment.id }, { status: 201 })
}
