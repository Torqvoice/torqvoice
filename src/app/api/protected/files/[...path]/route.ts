import { NextRequest, NextResponse } from 'next/server'
import { svgDownloadHeaders } from '@/lib/upload-url'
import { getAuthContext } from '@/lib/get-auth-context'
import { open, readFile, stat } from 'fs/promises'
import path from 'path'
import { uploadsRoot } from '@/lib/upload-root'
import { parseByteRange } from '@/lib/byte-range'

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
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const ctx = await getAuthContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const segments = await params
  // Expected: [orgId, category, filename]
  if (segments.path.length !== 3) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const [orgId, category, filename] = segments.path

  // Verify user belongs to the requested org
  if (orgId !== ctx.organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Every folder the upload routes write into. A folder missing here serves
  // 400 for a file that uploaded perfectly well, which reads as a broken
  // image rather than as a misconfiguration.
  const allowedCategories = [
    'vehicles',
    'inventory',
    'services',
    'logos',
    'email-logos',
    'email-images',
    'quotes',
    'portal',
    'tire-hotel',
    'email',
  ]
  if (!allowedCategories.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  // Prevent directory traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
  }

  const filePath = path.join(uploadsRoot(), orgId, category, filename)

  let size: number
  try {
    size = (await stat(filePath)).size
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (ext === 'svg') {
    return new NextResponse(await readFile(filePath), {
      headers: svgDownloadHeaders('private, max-age=31536000, immutable'),
    })
  }
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

  // A video player asks for the piece it needs rather than the whole clip,
  // and an iPhone will not play one from a server that cannot answer that.
  const range = parseByteRange(request.headers.get('range'), size)
  if (range === 'unsatisfiable') {
    return new NextResponse(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` },
    })
  }
  if (range) {
    // Only the span asked for is read, so seeking through a 60 MB clip does
    // not pull all of it into memory on every request.
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
        'Content-Type': contentType,
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Content-Length': String(chunk.length),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    })
  }

  return new NextResponse(await readFile(filePath), {
    headers: {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
