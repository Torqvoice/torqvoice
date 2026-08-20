import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { writeFile, mkdir, stat } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

/**
 * Photos and documents held against a stored tire set.
 *
 * Images because that is the point, a kerbed rim is easier to show than to
 * describe, and PDFs because a damage report or a signed storage agreement
 * belongs with the tires it is about. Video is deliberately not accepted: it
 * cannot be embedded in an invoice, which is where these end up.
 */
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf']

/** Generous for a phone photo, small enough that an invoice stays emailable. */
const MAX_SIZE = 15 * 1024 * 1024

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Only JPEG, PNG, WebP, AVIF and PDF files are allowed' },
      { status: 400 }
    )
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File size must be under 15MB' }, { status: 400 })
  }

  // A generated name, never the uploaded one: a file called ../../server.key
  // must not be able to decide where it lands.
  const ext =
    file.name
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'bin'
  const filename = `${crypto.randomUUID()}.${ext}`
  const uploadDir = path.join(process.cwd(), 'data', 'uploads', ctx.organizationId, 'tire-hotel')

  await mkdir(uploadDir, { recursive: true })
  const finalPath = path.join(uploadDir, filename)
  await writeFile(finalPath, new Uint8Array(await file.arrayBuffer()))
  const written = await stat(finalPath)

  return NextResponse.json({
    url: `/api/protected/files/${ctx.organizationId}/tire-hotel/${filename}`,
    fileName: file.name,
    fileType: file.type,
    fileSize: written.size,
  })
}
