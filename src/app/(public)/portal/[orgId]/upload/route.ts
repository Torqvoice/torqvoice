import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { isPortalLive } from '@/features/portal/Lib/portalLive'
import {
  isOwnPortalUpload,
  portalUploadFileName,
} from '@/features/portal/Lib/portalUploadOwner.server'
import {
  PORTAL_PHOTO_MAX_BYTES,
  PORTAL_UPLOAD_FOLDER,
  PORTAL_VIDEO_MAX_BYTES,
  portalUploadKind,
} from '@/features/portal/Lib/portalUploads'
import { isRestoring, RESTORE_IN_PROGRESS_MESSAGE } from '@/lib/backup/freeze'
import { assertContentLength } from '@/lib/backup/zip-guard'
import { getCustomerSession } from '@/lib/customer-session'
import { discardUnsavedUpload, releaseFiles } from '@/lib/files/manager'
import { compressPhoto } from '@/lib/image-upload.server'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { rateLimit } from '@/lib/rate-limit'
import { uploadsRoot } from '@/lib/upload-root'
import { sniffDeclaredVideo } from '@/lib/video-sniff'

/**
 * The one place a customer's files arrive: a photo for the chat, photos and a
 * short video with a request for a visit.
 *
 * It lives under /portal/... and not /api/public/...: the customer's session
 * cookie is scoped to the path "/portal", so a browser would not send it
 * anywhere else (the invoice PDF route is here for the same reason).
 *
 * POST    multipart, field `file`. Answers `{ url, name, type, size }` where
 *         `url` is the stored url (`/api/protected/files/<org>/portal-uploads/
 *         <uuid>.<ext>`): the value a message or a request is then saved with.
 *         The name is uuid-shaped and says which customer uploaded it.
 * DELETE  JSON `{ url }` or `{ urls: [...] }`: files the customer took out
 *         again before sending, or left behind by closing the page.
 *
 * What a signed-in customer may put on the workshop's disk is bounded here,
 * never trusted to the page:
 * - only photos and video, by what the bytes are and not what the file says;
 * - every photo is decoded and saved again as a 1600 px JPEG, so an original
 *   off a phone camera, or a crafted file, is never stored as sent;
 * - a video is kept as it came, so it has to open like the container it
 *   claims and is capped at PORTAL_VIDEO_MAX_BYTES;
 * - a request larger than that is refused from its header, before its body
 *   is read into memory;
 * - one customer sends at most PER_CUSTOMER files in a quarter of an hour,
 *   wherever they send them from, and one address RATE_PER_MINUTE a minute.
 *
 * A file written here has no row yet. It gets one when the message or the
 * request is saved; until then it is removed by the DELETE below when the
 * customer takes it out or leaves, and by the nightly sweep of unreferenced
 * files (lib/files/manager.ts) when the browser never said goodbye.
 *
 * Answers carry a `code` the page turns into words in the customer's own
 * language; `error` is English and for the log.
 */

const RATE_PER_MINUTE = 30
const PER_CUSTOMER = 40
const PER_CUSTOMER_WINDOW_MS = 15 * 60_000

/** A phone photo saved for a workshop to zoom into a part number or a crack. */
const PHOTO_MAX_SIDE = 1600

// The multipart framing around the file adds a little to the body.
const MAX_BODY = PORTAL_VIDEO_MAX_BYTES + 1024 * 1024

/** How many files each customer has sent lately. In memory, like lib/rate-limit. */
const sentLately = new Map<string, { count: number; resetAt: number }>()

function overCustomerBudget(customerId: string, now = Date.now()): boolean {
  // Swept on the way in, so the map never outgrows the customers of one window.
  for (const [key, entry] of sentLately) if (now > entry.resetAt) sentLately.delete(key)
  const entry = sentLately.get(customerId)
  if (!entry) {
    sentLately.set(customerId, { count: 1, resetAt: now + PER_CUSTOMER_WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > PER_CUSTOMER
}

function refuse(status: number, code: string, error: string) {
  return NextResponse.json({ code, error }, { status })
}

/** The signed-in customer of the workshop in the address, or the refusal. */
async function customerOf(
  orgParam: string
): Promise<
  | { refusal: NextResponse; organizationId?: undefined; customerId?: undefined }
  | { refusal?: undefined; organizationId: string; customerId: string }
> {
  const session = await getCustomerSession()
  if (!session) return { refusal: refuse(401, 'signedOut', 'Not signed in') }
  const org = await resolvePortalOrg(orgParam)
  if (!org) return { refusal: refuse(404, 'notFound', 'Not found') }
  // A session for one workshop opens nothing in another.
  if (org.id !== session.organizationId) {
    return { refusal: refuse(403, 'forbidden', 'Forbidden') }
  }
  if (!(await isPortalLive(org.id))) {
    return { refusal: refuse(403, 'forbidden', 'The portal is not open') }
  }
  // While a restore replaces this workshop's rows and files, nothing is written here.
  if (isRestoring(org.id)) {
    return { refusal: refuse(409, 'restoring', RESTORE_IN_PROGRESS_MESSAGE) }
  }
  return { organizationId: org.id, customerId: session.customerId }
}

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const limited = rateLimit(request, {
    limit: RATE_PER_MINUTE,
    windowMs: 60_000,
    anonymous: true,
  })
  if (limited) return limited

  const { orgId: orgParam } = await params
  const who = await customerOf(orgParam)
  if (who.refusal) return who.refusal
  const { organizationId, customerId } = who

  // Refused from the header, before the body is buffered into memory.
  try {
    assertContentLength(request, MAX_BODY)
  } catch {
    return refuse(413, 'tooLarge', 'The file is too large')
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return refuse(400, 'noFile', 'No file provided')
  const kind = portalUploadKind(file.type)
  if (!kind) return refuse(400, 'type', 'Only photos and video can be sent')
  if (file.size === 0) return refuse(400, 'empty', 'The file is empty')
  if (file.size > (kind === 'video' ? PORTAL_VIDEO_MAX_BYTES : PORTAL_PHOTO_MAX_BYTES)) {
    return refuse(400, 'tooLarge', 'The file is too large')
  }

  // Counted once the request is known to be a real file from a real customer,
  // and before anything is decoded or written.
  if (overCustomerBudget(customerId)) {
    return refuse(429, 'tooMany', 'Too many files. Try again in a while.')
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  let stored: { data: Uint8Array; ext: string; type: string }
  if (kind === 'video') {
    // What it is, not what it calls itself: a playlist or a script labelled
    // video/mp4 never reaches the disk.
    const container = sniffDeclaredVideo(file.type.toLowerCase(), bytes)
    if (!container) return refuse(400, 'type', 'Not a video we can read')
    stored = { data: bytes, ext: container, type: `video/${container}` }
  } else {
    try {
      const photo = await compressPhoto(bytes, PHOTO_MAX_SIDE)
      stored = { data: new Uint8Array(photo.data), ext: 'jpg', type: 'image/jpeg' }
    } catch {
      // Not a picture sharp can read, whatever it called itself.
      return refuse(400, 'type', 'Not a photo we can read')
    }
  }

  // The name on disk is generated; the customer's own name is only a label.
  // It carries who uploaded it (portalUploadOwner.server.ts), so only this
  // customer can later attach the file to a message or a request, or take it
  // out again.
  const filename = portalUploadFileName(organizationId, customerId, stored.ext)
  const dir = path.join(uploadsRoot(), organizationId, PORTAL_UPLOAD_FOLDER)
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, filename), stored.data)
  } catch (error) {
    // Half a file is worse than none: nothing will ever point at it.
    await discardUnsavedUpload(organizationId, PORTAL_UPLOAD_FOLDER, filename)
    console.error('[portal-upload] could not store the file:', error)
    return refuse(500, 'failed', 'Could not store the file')
  }

  return NextResponse.json(
    {
      url: `/api/protected/files/${organizationId}/${PORTAL_UPLOAD_FOLDER}/${filename}`,
      // The customer's name for it, with the extension the stored file has.
      name: `${(file.name || kind).replace(/\.[^.]*$/, '').slice(0, 190)}.${stored.ext}`,
      type: stored.type,
      size: stored.data.length,
    },
    { status: 201 }
  )
}

/** The most urls one goodbye may name: a full request's worth, with room. */
const MAX_RELEASED = 20

/**
 * Files the customer took out again, or left in a form they closed.
 *
 * Only files this customer uploaded themselves (the name says whose it is,
 * see portalUploadOwner.server.ts): another customer's upload that has not
 * been sent yet is not theirs to take away, whoever learnt its address. And
 * through the file manager's ordinary release: a file a message or a request
 * already mentions is kept whatever this is asked, and one that goes is moved
 * to the trash for thirty days, never deleted outright.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const limited = rateLimit(request, {
    limit: RATE_PER_MINUTE,
    windowMs: 60_000,
    anonymous: true,
  })
  if (limited) return limited

  const { orgId: orgParam } = await params
  const who = await customerOf(orgParam)
  if (who.refusal) return who.refusal
  const { organizationId, customerId } = who

  const body = (await request.json().catch(() => null)) as {
    url?: unknown
    urls?: unknown
  } | null
  const listed = Array.isArray(body?.urls) ? (body?.urls as unknown[]) : []
  const named = [body?.url, ...listed]
    .filter((url): url is string => isOwnPortalUpload(url, organizationId, customerId))
    .slice(0, MAX_RELEASED)
  if (named.length === 0) return refuse(400, 'noFile', 'No file named')

  const result = await releaseFiles(named, {
    organizationId,
    reason: 'a customer removed an upload before sending it',
  })
  return NextResponse.json({ removed: result.removed.length, kept: result.kept.length })
}
