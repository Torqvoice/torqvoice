import { readFile, stat } from 'fs/promises'
import { NextResponse } from 'next/server'
import path from 'path'
import { EMAIL_LOGO_CATEGORY } from '@/features/email/Lib/emailTemplate'

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

const FILE_NAME = /^[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/

/**
 * Serves an email logo to mail clients, which carry no session.
 *
 * Public by nature: the same image is at the top of every mail the workshop
 * sends. The file name is a random id, so nothing can be enumerated, and the
 * path is built from checked parts only, so nothing can be traversed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string; file: string }> }
) {
  const { orgId, file } = await params
  if (!/^[A-Za-z0-9_-]+$/.test(orgId) || !FILE_NAME.test(file)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const filePath = path.join(process.cwd(), 'data', 'uploads', orgId, EMAIL_LOGO_CATEGORY, file)
  try {
    await stat(filePath)
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ext = file.split('.').pop()?.toLowerCase() ?? 'png'
  return new NextResponse(await readFile(filePath), {
    headers: {
      'Content-Type': MIME_TYPES[ext] ?? 'image/png',
      // The name is unique per upload, so a client may keep it for good.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
