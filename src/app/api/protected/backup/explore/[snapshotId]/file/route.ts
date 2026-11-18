import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { NextRequest, NextResponse } from 'next/server'
import { extractRestorePointFile, RestorePointClosedError } from '@/lib/backup/explore'
import { getAuthContext } from '@/lib/get-auth-context'

/**
 * One upload as it was inside a restore point: a photo or document a record
 * in the explorer points at. The restore point must be open (the explorer
 * opened it), the viewer an owner or administrator of the workshop whose
 * repository it is, and the file is looked for only under that workshop's
 * uploads folder in the snapshot. Served inline for what a browser shows,
 * as a download for the rest, and never cached: the restore point closes.
 */

const INLINE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { snapshotId } = await params
  const category = request.nextUrl.searchParams.get('category') ?? ''
  const name = request.nextUrl.searchParams.get('name') ?? ''
  if (!/^[0-9a-f]{8,64}$/.test(snapshotId)) {
    return NextResponse.json({ error: 'Invalid snapshot id' }, { status: 400 })
  }

  let file: string
  let bytes: number
  try {
    ;({ file, bytes } = await extractRestorePointFile(
      ctx.organizationId,
      snapshotId,
      category,
      name
    ))
  } catch (err) {
    if (err instanceof RestorePointClosedError) {
      return NextResponse.json({ error: 'restorePointClosed' }, { status: 409 })
    }
    const message = err instanceof Error ? err.message : 'Could not read the file'
    const status = /not in this restore point/.test(message) ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }

  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const inline = INLINE[ext]
  const safeName = name.replace(/[^A-Za-z0-9._-]/g, '_')
  return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      'Content-Type': inline ?? 'application/octet-stream',
      'Content-Length': String(bytes),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
