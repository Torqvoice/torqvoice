import { NextRequest, NextResponse } from 'next/server'
import { shareLinkExpiredResponse } from '@/lib/share-link-route'
import { svgDownloadHeaders } from '@/lib/upload-url'
import { isSharedFile, resolveSharedFileToken } from '@/lib/shared-files.server'
import { readFile, stat } from 'fs/promises'
import path from 'path'
import { uploadsRoot } from '@/lib/upload-root'

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  pdf: 'application/pdf',
  csv: 'text/csv',
  txt: 'text/plain',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; path: string[] }> }
) {
  const { token, path: segments } = await params

  // Expected: [category, filename]
  if (segments.length !== 2) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const [category, filename] = segments

  // Every folder a shared document's images and attachments can live in. A
  // tire-hotel job's photos sat under its own folder, which this list did not
  // know, so its share link showed every image but those.
  const allowedCategories = [
    'vehicles',
    'inventory',
    'services',
    'logos',
    'quotes',
    'tire-hotel',
    'inspections',
    'documents',
  ]
  if (!allowedCategories.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  // Prevent directory traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
  }

  // One lookup of the token answers both whether its link is still open and
  // which document's files it opens. A document's pictures close with its
  // link. A file the document does not show answers exactly as a missing one
  // does, so the route never says whether a name exists.
  const shared = await resolveSharedFileToken(token)
  if (shared.status === 'expired') return shareLinkExpiredResponse()
  if (shared.status !== 'open' || !(await isSharedFile(shared.document, category, filename))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const orgId = shared.document.organizationId
  const filePath = path.join(uploadsRoot(), orgId, category, filename)

  try {
    await stat(filePath)
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Never cached: a cache would keep serving the file after the link closed,
  // and a portal customer's file must not reach anyone else.
  const buffer = await readFile(filePath)
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (ext === 'svg') {
    return new NextResponse(buffer, {
      headers: svgDownloadHeaders('private, no-store'),
    })
  }
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
