import { readFile, stat } from 'fs/promises'
import { NextResponse } from 'next/server'
import path from 'path'
import { EMAIL_IMAGE_CATEGORY } from '@/features/email/Lib/emailTemplate'
import { uploadsRoot } from '@/lib/upload-root'

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

const FILE_NAME = /^[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/

/**
 * Serves an image block's picture to mail clients, which carry no session.
 *
 * Public by nature: the picture is in every copy of the mail. The file name
 * is a random id, so nothing can be enumerated, and the path is built from
 * checked parts only, so nothing can be traversed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string; file: string }> }
) {
  const { orgId, file } = await params
  if (!/^[A-Za-z0-9_-]+$/.test(orgId) || !FILE_NAME.test(file)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const filePath = path.join(uploadsRoot(), orgId, EMAIL_IMAGE_CATEGORY, file)
  try {
    await stat(filePath)
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ext = file.split('.').pop()?.toLowerCase() ?? 'jpg'
  return new NextResponse(await readFile(filePath), {
    headers: {
      'Content-Type': MIME_TYPES[ext] ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
