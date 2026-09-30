import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { cleanImage } from '@/lib/image-upload.server'
import { uploadsRoot } from '@/lib/upload-root'

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext()

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      return NextResponse.json({ error: 'Upload a PNG, JPEG or WebP image' }, { status: 400 })
    }

    // Backgrounds are allowed to be larger than logos.
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 8MB' }, { status: 400 })
    }

    // Decoded and re-encoded: the stored file holds pixels and nothing else,
    // and its extension is what the bytes turned out to be, not the name.
    let clean: Awaited<ReturnType<typeof cleanImage>>
    try {
      clean = await cleanImage(Buffer.from(await file.arrayBuffer()), { maxSide: 2560 })
    } catch {
      return NextResponse.json({ error: 'Not an image we can read' }, { status: 400 })
    }

    const fileName = `${randomUUID()}.${clean.ext}`
    const uploadDir = path.join(uploadsRoot(), ctx.organizationId, 'portal')

    await mkdir(uploadDir, { recursive: true })
    await writeFile(path.join(uploadDir, fileName), clean.data)

    const url = `/api/protected/files/${ctx.organizationId}/portal/${fileName}`

    // Nothing is deleted here: the previous background is let go when the
    // setting is saved with this one (lib/files/settings.ts), and an upload
    // that is never saved is swept.

    return NextResponse.json({ url, fileName })
  } catch (error) {
    console.error('[Portal Background Upload] Error:', error)
    return NextResponse.json({ error: 'Failed to upload background' }, { status: 500 })
  }
}
