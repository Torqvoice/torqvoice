import { open, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { PORTAL_UPLOAD_FOLDER } from '@/features/portal/Lib/portalUploads'
import { parseByteRange } from '@/lib/byte-range'
import { getCustomerSession } from '@/lib/customer-session'
import { db } from '@/lib/db'
import { isGeneratedName } from '@/lib/files/manager'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { rateLimit } from '@/lib/rate-limit'
import { uploadsRoot } from '@/lib/upload-root'

/**
 * A photo or video in the customer's chat or on their booking, read by the
 * customer.
 *
 * Under /portal and not /api/public: the customer's session cookie is scoped
 * to the path "/portal", so a browser only sends it here.
 *
 * A file is served to the signed-in customer of this workshop when one of
 * their own records mentions it: a message in their thread (either
 * direction) or a service request they sent. The name alone is never enough:
 * another customer's photo answers 404, exactly as a file that does not
 * exist does, so nothing is learned by guessing.
 */

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  heic: 'image/heic',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
}

const CACHE = 'private, max-age=31536000, immutable'
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string; name: string }> }
) {
  // A thread of photos loads many at once; a scraper asks for far more.
  const limited = rateLimit(request, { limit: 240, windowMs: 60_000 })
  if (limited) return limited

  try {
    const { orgId: orgParam, name } = await params

    const session = await getCustomerSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const org = await resolvePortalOrg(orgParam)
    if (!org || org.id !== session.organizationId) return notFound()

    // Only names the upload route generates: a uuid and an extension. That
    // also rules out every path trick before the name is used as one.
    if (!isGeneratedName(name)) return notFound()

    const storedUrl = `/api/protected/files/${org.id}/${PORTAL_UPLOAD_FOLDER}/${name}`
    const owner = { organizationId: org.id, customerId: session.customerId }
    const [message, request_] = await Promise.all([
      db.portalMessage.findFirst({
        where: { ...owner, attachments: { has: storedUrl } },
        select: { id: true },
      }),
      db.serviceRequest.findFirst({
        where: { ...owner, attachments: { has: storedUrl } },
        select: { id: true },
      }),
    ])
    if (!message && !request_) return notFound()

    const folder = path.resolve(uploadsRoot(), org.id, PORTAL_UPLOAD_FOLDER)
    const filePath = path.resolve(folder, name)
    if (path.dirname(filePath) !== folder) return notFound()

    let size: number
    try {
      size = (await stat(filePath)).size
    } catch {
      return notFound()
    }

    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    const type = MIME_TYPES[ext]
    const headers: Record<string, string> = {
      // Anything that is not a known picture, video or PDF is a download,
      // never something the browser renders in the portal's origin.
      'Content-Type': type ?? 'application/octet-stream',
      ...(type ? {} : { 'Content-Disposition': 'attachment' }),
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
      'Cache-Control': CACHE,
    }

    // A video player asks for the piece it needs, and an iPhone will not
    // play from a server that answers a range with the whole file.
    const range = parseByteRange(request.headers.get('range'), size)
    if (range === 'unsatisfiable') {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      })
    }
    if (range) {
      const chunk = Buffer.alloc(range.end - range.start + 1)
      const handle = await open(filePath, 'r')
      try {
        await handle.read(chunk, 0, chunk.length, range.start)
      } finally {
        await handle.close()
      }
      return new NextResponse(chunk, {
        status: 206,
        headers: {
          ...headers,
          'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
          'Content-Length': String(chunk.length),
        },
      })
    }

    return new NextResponse(await readFile(filePath), { headers })
  } catch (error) {
    console.error('[portal file]', error)
    return NextResponse.json({ error: 'Could not read the file' }, { status: 500 })
  }
}
